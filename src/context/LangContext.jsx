import { createContext, useContext } from 'react'
import { dateLocale } from '../utils/rounds'

const LangContext = createContext({ lang: 'en', locale: 'en-US' })

export function LangProvider({ lang, children }) {
  return (
    <LangContext.Provider value={{ lang, locale: dateLocale(lang) }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  return useContext(LangContext)
}
