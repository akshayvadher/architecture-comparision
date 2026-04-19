import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const isTest = process.env.NODE_ENV === 'test';
const tracingEnabled = Boolean(endpoint) && !isTest;

let sdk: NodeSDK | undefined;

if (tracingEnabled && endpoint) {
  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'cqrs-es',
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint.replace(/\/$/, '')}/v1/traces`,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });
  sdk.start();

  process.on('SIGTERM', () => {
    sdk?.shutdown().catch(() => undefined);
  });
}
