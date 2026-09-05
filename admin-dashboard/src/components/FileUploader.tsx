import React, { useState } from 'react'
import { apiFetch } from '../api'

interface FileUploaderProps {
  tenantId: string
  onUpload: () => void
}

export function FileUploader({ tenantId, onUpload }: FileUploaderProps) {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<string[]>([])
  const [sourceType, setSourceType] = useState<'pdf' | 'txt' | 'faq'>('pdf')
  const [faqText, setFaqText] = useState('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files))
    }
  }

  const handleUpload = async () => {
    if (files.length === 0 && sourceType === 'faq' && !faqText.trim()) return

    setUploading(true)
    setResults([])

    try {
      if (sourceType === 'faq') {
        // Parse FAQ JSON
        let faqItems
        try {
          faqItems = JSON.parse(faqText)
        } catch {
          setResults(['Invalid JSON format for FAQ'])
          setUploading(false)
          return
        }

        const response = await apiFetch(`/admin/tenants/${tenantId}/knowledge/text`, {
          method: 'POST',
          body: JSON.stringify({
            source_id: `faq_${Date.now()}`,
            source_type: 'faq',
            content: JSON.stringify(faqItems)
          })
        })

        if (response.ok) {
          setResults(['FAQ uploaded successfully!'])
          onUpload()
        } else {
          setResults(['Failed to upload FAQ'])
        }
      } else {
        // Upload files
        for (const file of files) {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('source_id', file.name.replace(/\.[^/.]+$/, ''))
          formData.append('source_type', sourceType)

          const response = await apiFetch(`/admin/tenants/${tenantId}/knowledge`, {
            method: 'POST',
            body: formData
          })

          if (response.ok) {
            setResults(prev => [...prev, `✓ ${file.name} uploaded`])
          } else {
            setResults(prev => [...prev, `✗ ${file.name} failed`])
          }
        }
        onUpload()
      }
    } catch (e) {
      console.error('Upload error:', e)
      setResults(['Upload failed'])
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="uploader">
      <div className="uploader-header">
        <h2>Knowledge Base</h2>
      </div>

      <div className="uploader-options">
        <label>
          <input
            type="radio"
            value="pdf"
            checked={sourceType === 'pdf'}
            onChange={() => setSourceType('pdf')}
          />
          PDF Document
        </label>
        <label>
          <input
            type="radio"
            value="txt"
            checked={sourceType === 'txt'}
            onChange={() => setSourceType('txt')}
          />
          Text/Markdown
        </label>
        <label>
          <input
            type="radio"
            value="faq"
            checked={sourceType === 'faq'}
            onChange={() => setSourceType('faq')}
          />
          FAQ (JSON)
        </label>
      </div>

      {sourceType === 'faq' ? (
        <div className="faq-input">
          <label>FAQ Data (JSON array of {'{question, answer}'} objects)</label>
          <textarea
            value={faqText}
            onChange={(e) => setFaqText(e.target.value)}
            placeholder='[{"question": "What are your hours?", "answer": "Mon-Fri 9-5"}, {"question": "Do you offer refunds?", "answer": "Yes, 30-day guarantee"}]'
            rows={8}
          />
        </div>
      ) : (
        <div className="file-input">
          <input
            type="file"
            onChange={handleFileChange}
            accept={sourceType === 'pdf' ? '.pdf' : '.txt,.md'}
            multiple
            disabled={uploading}
          />
          {files.length > 0 && (
            <div className="file-list">
              {files.map((f, i) => (
                <div key={i} className="file-item">
                  <span>{f.name}</span>
                  <span>({(f.size / 1024).toFixed(1)} KB)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        className="btn btn-primary"
        onClick={handleUpload}
        disabled={uploading || (files.length === 0 && sourceType !== 'faq') || (sourceType === 'faq' && !faqText.trim())}
      >
        {uploading ? 'Uploading...' : 'Upload Knowledge'}
      </button>

      {results.length > 0 && (
        <div className="upload-results">
          {results.map((r, i) => (
            <div key={i} className={r.startsWith('✓') ? 'success' : 'error'}>
              {r}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}