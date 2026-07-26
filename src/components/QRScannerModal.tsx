import { useEffect, useRef, useState } from 'react'
import { CloseIcon, ExternalIcon } from '../icons'

interface Props {
  onClose: () => void
}

export default function QRScannerModal({ onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [scannedUrl, setScannedUrl] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch (e: any) {
        setError('Kamera konnte nicht geöffnet werden — Kamera-Zugriff im Browser erlauben.')
      }
    }
    startCamera()

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  function handleOpenBike(code: string) {
    const clean = code.trim()
    if (!clean) return
    const url = clean.startsWith('http')
      ? clean
      : `https://www.nextbike.de/de/muenchen/?bike=${clean}`
    setScannedUrl(url)
    window.location.href = url
  }

  return (
    <div className="picker">
      <div className="picker-top">
        <span>📷 Rad-QR-Code scannen</span>
        <button className="picker-x" onClick={onClose}>
          <CloseIcon size={14} /> ZURÜCK
        </button>
      </div>

      <div className="qr-body">
        <div className="qr-viewport">
          <video ref={videoRef} className="qr-video" autoPlay playsInline muted />
          <div className="qr-frame">
            <div className="qr-laser" />
          </div>
          {error && <div className="qr-error">{error}</div>}
        </div>

        <div className="qr-manual-box">
          <label className="qr-label">RAD-NUMMER MANUELL EINGEBEN:</label>
          <div className="qr-input-row">
            <input
              type="number"
              placeholder="z. B. 34821"
              className="qr-input"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
            />
            <button
              className="btn-block qr-btn"
              disabled={!manualCode.trim()}
              onClick={() => handleOpenBike(manualCode)}
            >
              <ExternalIcon size={14} /> Öffnen
            </button>
          </div>
        </div>

        {scannedUrl && (
          <div className="qr-success">
            Öffne Nextbike App für Rad …
          </div>
        )}
      </div>
    </div>
  )
}
