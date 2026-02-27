export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (
      (err && typeof err === 'object' && err.code === 'ERR_MODULE_NOT_FOUND') &&
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !specifier.endsWith('.js')
    ) {
      return nextResolve(specifier + '.js', context);
    }
    throw err;
  }
}
