declare module '@xenova/transformers' {
  export const env: any;
  export function pipeline(task: string, model: string, opts?: any): Promise<any>;
}
