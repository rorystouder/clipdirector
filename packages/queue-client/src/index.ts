// Phase 1 implementation target. See PRD Section 9.
// Will wrap BullMQ with typed Queue/Worker factories for the orchestrator and render queues,
// plus the JobStatusRecord HSET helpers.

export const QUEUE_NAMES = {
  ORCHESTRATOR: 'orchestrator-queue',
  RENDER: 'render-queue',
  DEAD_LETTER: 'dead-letter-queue',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
