// This dependency must evaluate before a resource defines its computed disposal methods.
// Vite lowers `using` for supported browsers, but those browsers may lack the two symbols.
for (const name of ['dispose', 'asyncDispose'] as const) {
  if (!Symbol[name]) Object.defineProperty(Symbol, name, { value: Symbol(`Symbol.${name}`) });
}
