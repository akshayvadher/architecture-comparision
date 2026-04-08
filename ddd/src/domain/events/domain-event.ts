export interface DomainEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: Date;
}
