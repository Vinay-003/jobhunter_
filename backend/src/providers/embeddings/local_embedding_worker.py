"""Persistent sentence-transformer worker; newline-delimited JSON over stdin/stdout.

Loads one model once; errors are reported as codes, not input or tracebacks.
"""
import json
import sys
import contextlib

model_id = sys.argv[1]
try:
    from sentence_transformers import SentenceTransformer
    with contextlib.redirect_stdout(sys.stderr):
        model = SentenceTransformer(model_id)
    revision = getattr(model[0].auto_model.config, '_commit_hash', None)
except Exception:
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
            limit = max(16, min(224, model.max_seq_length - 8))
            for text in texts:
                ids = model.tokenizer.encode(text, add_special_tokens=False)
                begin = len(chunks)
                chunks.extend(model.tokenizer.decode(ids[i:i+limit]) for i in range(0, len(ids), limit))
                if len(chunks) == begin:
                    chunks.append('')
                spans.append((begin, len(chunks)))
            with contextlib.redirect_stdout(sys.stderr):
                encoded = model.encode(chunks, normalize_embeddings=True)
            vectors = []
            for begin, end in spans:
                vector = np.mean(encoded[begin:end], axis=0)
                vector /= max(float(np.linalg.norm(vector)), 1e-12)
                vectors.append(vector.tolist())
            response = {'id': request['id'], 'vectors': vectors, 'modelId': model_id, 'modelRevision': revision, 'dimension': len(vectors[0]) if vectors else 384}
    except Exception:
        response = {'id': request.get('id', -1) if 'request' in locals() and isinstance(request, dict) else -1, 'error': 'INFERENCE_FAILED'}
    print(json.dumps(response, separators=(',', ':')), flush=True)
