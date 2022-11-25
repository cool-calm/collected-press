export function pair<K, V>(key: K, value: V): readonly [K, V] {
  return Object.freeze([key, value] as const);
}

export function into(target, input) {
  let setter

  if ('append' in target && typeof target.append === 'function') {
    setter = target.append
  } else if ('set' in target && typeof target.set === 'function') {
    setter = target.set
  } else if ('add' in target && typeof target.add === 'function') {
    setter = target.add
  } else if ('push' in target && typeof target.push === 'function') {
    setter = item => target.push(item)
  } else {
    setter = (key, value) => {
      target[key] = value
    }
  }

  for (const item of input) {
    setter.apply(target, item)
  }
  return target
}
