import React, { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../api'

interface FileUploaderProps {
  tenantId: string
  onUpload: () => void
}

interface KnowledgeSource {
  source_id: string
  source_type: string
  chunk_count: number
  last_updated?: number
}

export function FileUploader({ tenantId, onUpload }: FileUploaderProps) {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<string[]>([])
  const [sourceType, setSourceType] = useState<'pdf' | 'txt' | 'faq'>('txt')
  const [faqText, setFaqText] = useState('')
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [loadingSources, setLoadingSources] = useState(true)
  const [deletingSource, setDeletingSource] = useState<string | null>(null)

  const loadSources = useCallback(async () => {
    try {
      const res = await apiFetch(`/admin/tenants/${tenantId}/knowledge`)
      if (res.ok) {
        const data = (await res.json()) as { sources?: KnowledgeSource[] }
        setSources(data.sources || [])
      }
    } catch (e) {
      console.error('Failed to load knowledge sources:', e)
    } finally {
      setLoadingSources(false)
    }
  }, [tenantId])

  useEffect(() => {
    loadSources()
  }, [loadSources])

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
          setResults(['✓ FAQ uploaded successfully!'])
        } else {
          const detail = await response.text().catch(() => '')
          setResults([`✗ FAQ upload failed (${response.status})${detail ? `: ${detail}` : ''}`])
        }
        onUpload()
        loadSources()
      } else if (sourceType === 'pdf') {
        setResults(['✗ PDF upload isn\u2019t supported yet — extract the PDF text first (e.g. pdftotext), then upload it as Text/Markdown.'])
      } else {
        // Text/Markdown: read each file client-side and POST as JSON text
        for (const file of files) {
          const text = await file.text()
          const sourceId = file.name.replace(/\.[^/.]+$/, '')
          const type = file.name.toLowerCase().endsWith('.md') ? 'md' : 'txt'
          const response = await apiFetch(`/admin/tenants/${tenantId}/knowledge/text`, {
            method: 'POST',
            body: JSON.stringify({
              source_id: sourceId,
              source_type: type,
              content: text
            })
          })

          if (response.ok) {
            const data = (await response.json().catch(() => null)) as { chunks_created?: number } | null
            const chunks = data?.chunks_created
            setResults(prev => [...prev, `✓ ${file.name} uploaded${chunks != null ? ` (${chunks} chunks)` : ''}`])
          } else {
            const detail = await response.text().catch(() => '')
            setResults(prev => [...prev, `✗ ${file.name} failed (${response.status})${detail ? `: ${detail}` : ''}`])
          }
        }
        setFiles([])
        onUpload()
        loadSources()
      }
    } catch (e) {
      console.error('Upload error:', e)
      setResults(['✗ Upload failed'])
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (sourceId: string) => {
    setDeletingSource(sourceId)
    try {
      const res = await apiFetch(`/admin/tenants/${tenantId}/knowledge/${encodeURIComponent(sourceId)}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setResults([`✓ Removed source "${sourceId}"`])
        await loadSources()
      } else {
        const detail = await res.text().catch(() => '')
        setResults([`✗ Delete failed (${res.status})${detail ? `: ${detail}` : ''}`])
      }
    } catch (e) {
      console.error('Delete error:', e)
      setResults(['✗ Delete failed'])
    } finally {
      setDeletingSource(null)
    }
  }

  const formatDate = (ts?: number) => {
    if (!ts) return '—'
    return new Date(ts * 1000).toLocaleString()
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
        <label>
          <input
            type="radio"
            value="pdf"
            checked={sourceType === 'pdf'}
            onChange={() => setSourceType('pdf')}
          />
          PDF Document
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
          {sourceType === 'txt' && (
            <small className="form-hint">
              The file is read on this page and uploaded as text. Best: a plain-text Q&amp;A or FAQ-style document.
            </small>
          )}
          {sourceType === 'pdf' && (
            <small className="form-hint">
              PDF parsing isn&rsquo;t available on the free plan yet — extract the text first, then use Text/Markdown.
            </small>
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

      <div className="knowledge-sources">
        <h3>Saved Knowledge ({sources.length})</h3>
        {loadingSources ? (
          <p className="form-hint">Loading saved sources…</p>
        ) : sources.length === 0 ? (
          <p className="form-hint">Nothing saved yet. Upload text, a .txt/.md file, or an FAQ above — it will appear here with its chunk count.</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Type</th>
                  <th>Chunks</th>
                  <th>Last Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sources.map((src) => (
                  <tr key={src.source_id}>
                    <td><code>{src.source_id}</code></td>
                    <td><span className="badge">{src.source_type}</span></td>
                    <td>{src.chunk_count}</td>
                    <td>{formatDate(src.last_updated)}</td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(src.source_id)}
                        disabled={deletingSource === src.source_id}
                      >
                        {deletingSource === src.source_id ? 'Removing…' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
