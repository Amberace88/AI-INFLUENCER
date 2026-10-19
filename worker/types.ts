export type JobParams = {
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  use_references?: boolean;
  reference_strength?: number;
};

export type Job = {
  id: string;
  owner_id: string;
  persona_id: string | null;
  kind: string;
  provider: "comfyui" | "fal";
  workflow: string;
  prompt: string;
  negative_prompt: string;
  params: JobParams;
  attempts: number;
  max_attempts: number;
};

export type ReferenceImage = {
  filename: string;
  mime: string;
  data: Buffer;
  signedUrl: string; // short-lived URL for cloud providers
};

export type OutputImage = {
  data: Buffer;
  mime: string;
  width?: number;
  height?: number;
};

export type ProviderResult = {
  images: OutputImage[];
  costUsd?: number;
  requestId?: string;
  meta?: Record<string, unknown>;
};

export type RunContext = {
  references: ReferenceImage[];
  onProgress: (fraction: number) => void;
  log: (msg: string) => void;
};

/** A provider whose error is a user/config problem should not be retried. */
export class PermanentError extends Error {}

export interface Provider {
  name: Job["provider"];
  healthCheck(): Promise<string>;
  run(job: Job, ctx: RunContext): Promise<ProviderResult>;
}
