import { CsvConnector } from "./csvConnector";
import { CommCareConnector } from "./commcareConnector";
import { GenericConnector } from "./genericConnector";
import type {
  ConnectorIngestResult,
  ConnectorInput,
  ConnectorKind,
  SourceConnector,
  TenantSpaceContext,
} from "../types";

const connectorRegistry: Record<ConnectorKind, SourceConnector> = {
  csv: new CsvConnector(),
  excel: new CsvConnector(),
  commcare: new CommCareConnector(),
  generic: new GenericConnector(),
};

/**
 * Retourne l'instance de connecteur correspondant au type demandé.
 */
export function getConnector(type: ConnectorKind): SourceConnector {
  return connectorRegistry[type];
}

/**
 * Point d'entrée unifié d'ingestion pour n'importe quelle source connectée.
 */
export async function ingestWithConnector(
  input: ConnectorInput,
  ctx: TenantSpaceContext
): Promise<ConnectorIngestResult> {
  const connector = getConnector(input.source.type);
  return connector.ingest(input, ctx);
}

export { CsvConnector, CommCareConnector, GenericConnector };
