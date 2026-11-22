declare module "jschardet" {
  export interface DetectResult {
    encoding: string | null;
    confidence: number;
  }
  export function detect(buffer: Buffer | Uint8Array | string): DetectResult;
}
