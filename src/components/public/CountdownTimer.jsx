// src/components/public/CountdownTimer.jsx
import { useState, useEffect } from 'react'
import { getCountdownTo } from '../../utils/rounds'

export default function CountdownTimer({ collectDate, isComplete, organizerName, organizerPhone, t }) {
  const [time, setTime] = useState(() => getCountdownTo(collectDate))

  useEffect(() => {
    if (isComplete) return
    const id = setInterval(() => setTime(getCountdownTo(collectDate)), 30000)
    return () => clearInterval(id)
  }, [collectDate, isComplete])

  if (isComplete) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100 text-center">
        <div className="text-3xl mb-2">🏁</div>
        <p className="text-lg font-bold text-gold-600">{t.tandaDone}</p>
        <p className="text-sm text-gray-500 mt-1">{t.allDone}</p>
      </div>
    )
  }

  if (time.done) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-5 border border-gold-200 bg-gold-50 text-center">
        <div className="text-3xl mb-2">🎯</div>
        <p className="font-bold text-gray-900">{t.collectionDay}</p>
        <p className="text-sm text-gray-600 mt-1">
          {t.sendTo} <strong>{organizerName || t.organizer}</strong> {t.viaZelle}
          {organizerPhone ? ` (${organizerPhone})` : ''} {t.today}
        </p>
      </div>
    )
  }

  const units = [
    { value: time.days,    label: t.days },
    { value: time.hours,   label: t.hours },
    { value: time.minutes, label: t.mins },
  ]

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 text-center">
        {t.nextIn}
      </p>
      <div className="flex items-center justify-center gap-3">
        {units.map(({ value, label }, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="text-center min-w-[3rem]">
              <div className="text-3xl font-black text-gray-900 tabular-nums">
                {String(value).padStart(2, '0')}
              </div>
              <div className="text-xs text-gray-400 font-medium mt-0.5">{label}</div>
            </div>
            {i < units.length - 1 && (
              <div className="text-2xl font-black text-gray-200 pb-4">:</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
