import { useState, useEffect, useCallback, createElement } from 'react'

export function getCleanPath() {
  if (typeof window === 'undefined') return '/'
  const p = window.location.pathname.replace(/\/+$/, '') || '/'
  return p
}

export function navigate(path, replace = false) {
  if (typeof window === 'undefined') return
  const target = path.startsWith('/') ? path : '/' + path
  if (replace) {
    window.history.replaceState({}, '', target)
  } else {
    window.history.pushState({}, '', target)
  }
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useRouter() {
  const [path, setPath] = useState(getCleanPath)

  useEffect(() => {
    const onPop = () => {
      setPath(getCleanPath())
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const nav = useCallback((to, replace = false) => {
    navigate(to, replace)
  }, [])

  return { path, navigate: nav }
}

export function Link({ href, onClick, children, className = '', ...props }) {
  const handleClick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    if (onClick) onClick(e)
    navigate(href)
  }

  return createElement('a', {
    href,
    onClick: handleClick,
    className,
    ...props,
  }, children)
}
