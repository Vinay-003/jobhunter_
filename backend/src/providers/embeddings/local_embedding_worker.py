"""Persistent sentence-transformer worker; newline-delimited JSON over stdin/stdout.

Loads one model once; errors are reported with diagnostic information.
"""
import json
import sys
import contextlib
import traceback

model_id = sys.argv[1]
try:
    from sentence_transformers import SentenceTransformer
    with contextlib.redirect_stdout(sys.stderr):
        model = SentenceTransformer(model_id)
    if hasattr(model, 'max_seq_length'):
        model.max_seq_length = 256
    if hasattr(model, 'tokenizer') and hasattr(model.tokenizer, 'model_max_length'):
        model.tokenizer.model_max_length = 100000
    revision = getattr(model[0].auto_model.config, '_commit_hash', None)
except Exception as e:
    sys.stderr.write(f"[worker-init-err] Failed to load model {model_id}: {e}\n{traceback.format_exc()}\n")
    sys.stderr.flush()
    model = None

for line in sys.stdin:
    try:
        request = json.loads(line)
        texts = request['texts']
        if model is None:
            response = {'id': request['id'], 'error': 'MODEL_UNAVAILABLE'}
        elif not isinstance(texts, list) or len(texts) > 32 or any(not isinstance(t, str) or len(t) > 5000 for t in texts):
            response = {'id': request['id'], 'error': 'INVALID_BATCH'}
        else:
            # Keep the entire bounded input; avoid silent 256-token truncation.
            import numpy as np
            chunks, spans = [], []
            limit = 128
            for text in texts:
                safe_text = (text or '').strip()
                begin = len(chunks)
                if not safe_text:
                    chunks.append('')
                else:
                    try:
                        ids = model.tokenizer.encode(safe_text, add_special_tokens=False)
                        if not ids:
                            chunks.append('')
                        else:
                            for i in range(0, len(ids), limit):
                                sub = model.tokenizer.decode(ids[i:i+limit])
                                chunks.append(sub if sub else '')
                    except Exception as tok_err:
                        sys.stderr.write(f"[worker-tok-warn] {tok_err}\n")
                        chunks.append(safe_text[:200])
                if len(chunks) == begin:
                    chunks.append('')
                spans.append((begin, len(chunks)))

            with contextlib.redirect_stdout(sys.stderr):
                encoded = model.encode(chunks, normalize_embeddings=True)

            dim = getattr(model, 'get_embedding_dimension', getattr(model, 'get_sentence_embedding_dimension', lambda: 384))() or 384

            vectors = []
            for begin, end in spans:
                if begin >= end or encoded is None or len(encoded) == 0:
                    vector = np.zeros(dim, dtype=np.float32)
                else:
                    slice_arr = encoded[begin:end]
                    vector = np.mean(slice_arr, axis=0)
                    norm = float(np.linalg.norm(vector))
                    if np.isfinite(norm) and norm > 1e-12:
                        vector = vector / norm
                    else:
                        vector = np.zeros(dim, dtype=np.float32)
                vectors.append(vector.tolist())

            response = {
                'id': request['id'],
                'vectors': vectors,
                'modelId': model_id,
                'modelRevision': revision,
                'dimension': len(vectors[0]) if vectors else dim,
            }
    except Exception as e:
        sys.stderr.write(f"[worker-err] id={request.get('id', -1) if 'request' in locals() and isinstance(request, dict) else -1} {type(e).__name__}: {e}\n{traceback.format_exc()}\n")
        sys.stderr.flush()
        response = {'id': request.get('id', -1) if 'request' in locals() and isinstance(request, dict) else -1, 'error': f'INFERENCE_FAILED: {type(e).__name__}: {e}'}
    print(json.dumps(response, separators=(',', ':')), flush=True)

