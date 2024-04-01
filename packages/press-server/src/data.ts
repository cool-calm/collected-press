export function pair<K, V>(key: K, value: V): readonly [K, V] {
  return Object.freeze([key, value] as const)
}

export function into(
  target: Headers | Map<string, string> | object,
  input: Iterable<readonly [string, string]>,
) {
  let setter

  if ('append' in target && typeof target.append === 'function') {
    setter = target.append
  } else if ('set' in target && typeof target.set === 'function') {
    setter = target.set
  } else if ('add' in target && typeof target.add === 'function') {
    setter = target.add
  } else {
    setter = (key: string, value: string) => {
      ;(target as Record<string, string>)[key] = value
    }
  }

  for (const item of input) {
    setter.apply(target, item)
  }
  return target
}
