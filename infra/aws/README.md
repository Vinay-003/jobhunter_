# infra/aws — SageMaker Serverless IaC

Options for provisioning the embedding endpoint. All map to the same runtime contract:
`InvokeEndpoint` with `Body: { inputs: string[], purpose: string }` → `{ embeddings|vectors: number[][] }`.

## Option A — Terraform (recommended for Render-hosted backend)

```hcl
# infra/aws/main.tf
terraform {
  required_providers { aws = { source = "hashicorp/aws" } }
}
provider "aws" { region = var.aws_region }

resource "aws_sagemaker_model" "embed" {
  name               = "jobhunter-embed"
  execution_role_arn = aws_iam_role.sagemaker.arn
  primary_container {
    image = "<account>.dkr.ecr.<region>.amazonaws.com/jobhunter-embed:latest"
    # or HF container: 763104351884.dkr.ecr.<region>.amazonaws.com/huggingface-pytorch-inference:2.1.0-transformers4.37.0-cpu-py310
    environment = { HF_MODEL_ID = var.embedding_model_id }
  }
}

resource "aws_sagemaker_endpoint_configuration" "serverless" {
  name = "jobhunter-embed-config"
  production_variants {
    variant_name           = "AllTraffic"
    model_name             = aws_sagemaker_model.embed.name
    serverless_config {
      memory_size_in_mb = 4096
      max_concurrency   = 5
    }
  }
}

resource "aws_sagemaker_endpoint" "serverless" {
  name                 = var.endpoint_name
  endpoint_config_name = aws_sagemaker_endpoint_configuration.serverless.name
}
```

```bash
terraform init
terraform apply -var endpoint_name=jobhunter-embed -var embedding_model_id=anass1209/resume-job-matcher-all-MiniLM-L6-v2
```

## Option B — AWS CDK (TypeScript)

```ts
import * as sagemaker from 'aws-cdk-lib/aws-sagemaker';
new sagemaker.CfnModel(this, 'EmbedModel', {
  executionRoleArn: role.roleArn,
  primaryContainer: { image: img, environment: { HF_MODEL_ID: 'anass1209/resume-job-matcher-all-MiniLM-L6-v2' } },
});
new sagemaker.CfnEndpointConfig(this, 'Cfg', {
  productionVariants: [{ variantName: 'AllTraffic', modelName: model.attrModelName, serverlessConfig: { memorySizeInMb: 4096, maxConcurrency: 5 } }],
});
new sagemaker.CfnEndpoint(this, 'Ep', { endpointName: 'jobhunter-embed', endpointConfigName: cfg.attrEndpointConfigName });
```

## Option C — SAM / CloudFormation

Package `template.yaml` with `AWS::SageMaker::Model`, `AWS::SageMaker::EndpointConfig` (ServerlessConfig), `AWS::SageMaker::Endpoint`.

## Option D — Console (no IaC)

SageMaker → Inference → Models → Create → Endpoint configuration (Serverless) → Endpoint. Keep memory 2048–4096 MB, concurrency 5.

## Wiring to backend

Set on Render (`jobhunter-backend` env):

```
AWS_REGION=<region>
AWS_SAGEMAKER_ENDPOINT_NAME=<endpoint-name>
AWS_ACCESS_KEY_ID=<iam-user-key>
AWS_SECRET_ACCESS_KEY=<secret>
EMBEDDING_MODEL_ID=anass1209/resume-job-matcher-all-MiniLM-L6-v2
```

Backend lazy-imports `@aws-sdk/client-sagemaker-runtime`; if any of the four AWS vars is missing it uses `MockEmbeddingProvider` automatically. Install the SDK as an optional dep if not present:

```bash
cd backend && npm i @aws-sdk/client-sagemaker-runtime
```

## Cost guardrails

- Serverless bills per invocation + duration; cold starts are expected.
- Keep `maxConcurrency` low, set `provisionedConcurrency` only if p99 latency requires it.
- Cache embeddings per `recommendation_run` / `analysis` where possible.

## Teardown

```bash
aws sagemaker delete-endpoint --endpoint-name <name>
aws sagemaker delete-endpoint-config --endpoint-config-name <config>
aws sagemaker delete-model --model-name <model>
```
