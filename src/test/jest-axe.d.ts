declare module 'jest-axe' {
  export interface AxeResults {
    violations: Array<{ id: string; impact?: string; description: string }>
  }

  export function axe(
    html: Element | string,
    options?: { rules?: Record<string, { enabled: boolean }> },
  ): Promise<AxeResults>

  export const toHaveNoViolations: unknown
}
