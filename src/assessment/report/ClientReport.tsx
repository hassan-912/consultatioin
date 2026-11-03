import { createPortal } from 'react-dom'
import logo from '../../assets/mg-logo-white.webp'
import './client-report.css'

// Ported from hassan-912/Visa-File-Strength-Calculator components/ClientReport.tsx so the consultation PDF matches
// the calculator's A4 client summary. Presentation only: scores and verdicts come from src/assessment.
// Local changes: plain <img> instead of next/image, document title used as the PDF file name, text fields
// render with dir="auto" so Arabic notes and names read correctly.

export interface ReportRow {
  label: string
  claim: string
  note?: string
  /** null for rows that award no points. */
  earned: number | null
  max?: number
  pointsText?: string
}
export interface ReportSection { key: string; title: string; caption: string; rows: ReportRow[]; max?: number; hideFromComposition?: boolean }
export interface ReportStatus { label: string; color: string; description: string }
export interface ReportPanel { title: string; facts: Array<{ label: string; value: string }>; notes?: string[]; notesAreText?: boolean }

export interface ClientReportProps {
  kind: string
  programme: string
  title: string
  clientName: string
  date: string
  reference: string
  score: number | null
  scoreSuffix?: string
  scoreContext?: string
  status: ReportStatus
  facts: Array<{ label: string; value: string }>
  composition?: Array<{ label: string; earned: number; max: number }>
  attention?: string[]
  detailsHeading?: string
  sections: ReportSection[]
  panels?: ReportPanel[]
  total?: { label: string; value: string; context: string }
  notes: string[]
  /** Printed under the letterhead document type. */
  documentType?: string
  /** Local addition: print the panels (e.g. consultant notes) before the detailed sections. */
  panelsFirst?: boolean
}

const fmt = (n: number) => n.toLocaleString('en-US')
const pct = (earned: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (earned / max) * 100)) : 0)

export function sectionTotals(section: ReportSection) {
  const earned = section.rows.reduce((sum, row) => sum + (row.earned ?? 0), 0)
  const max = section.max ?? section.rows.reduce((sum, row) => sum + (row.max ?? 0), 0)
  return { earned, max }
}
const isScored = (section: ReportSection) => section.rows.some(row => row.earned !== null && row.max !== undefined)

/** Opens the browser's print dialog for this report; choose "Save as PDF". The file name comes from `fileName`. */
export function printReport(kind: string, fileName: string, delay = 150) {
  const title = document.title
  const mark = () => document.querySelectorAll<HTMLElement>(`body > .cr-report[data-report="${kind}"]`).forEach(el => { el.dataset.printing = '' })
  const clear = () => {
    document.querySelectorAll<HTMLElement>('body > .cr-report[data-printing]').forEach(el => { delete el.dataset.printing })
    document.title = title
  }
  clear()
  window.addEventListener('afterprint', clear, { once: true })
  setTimeout(() => { document.title = fileName; mark(); window.print() }, delay)
}

function Meter({ value, max }: { value: number; max: number }) {
  return <span className="cr-meter" aria-hidden="true"><span style={{ width: `${pct(value, max)}%` }} /></span>
}

function Points({ row }: { row: ReportRow }) {
  if (row.earned === null) return <span className="cr-text">{row.pointsText ?? 'Requirement'}</span>
  if (row.max === undefined) return <strong>{row.earned < 0 ? `−${fmt(-row.earned)}` : fmt(row.earned)}</strong>
  return <><strong>{fmt(row.earned)}</strong><small> / {fmt(row.max)}</small></>
}

function ReportBody(props: ClientReportProps) {
  const { programme, title, clientName, date, reference, score, scoreSuffix = '', scoreContext, status, facts, attention = [], detailsHeading = 'Detailed breakdown', sections, panels = [], total, notes, documentType = 'Client assessment summary', panelsFirst = false } = props
  const panelList = panels.map(panel => (
    <section key={panel.title} className="cr-panel">
      <h2>{panel.title}</h2>
      {panel.facts.length > 0 && (
        <dl className="cr-facts">
          {panel.facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd dir="auto">{fact.value}</dd></div>)}
        </dl>
      )}
      {panel.notes?.map(note => <p key={note} dir="auto" className={`cr-panel-note${panel.notesAreText ? ' is-notes' : ''}`}>{note}</p>)}
    </section>
  ))
  const composition = props.composition ?? sections.filter(s => isScored(s) && !s.hideFromComposition).map(s => ({ label: s.title, ...sectionTotals(s) }))
  return (
    <>
      <header className="cr-letterhead">
        <div className="cr-brand">
          <img src={logo} alt="MG Visa" width={96} height={96} className="cr-logo" />
          <div>
            <p className="cr-firm">MG International Visa Consultancy</p>
            <p className="cr-firm-meta">Cairo · Dubai · Zayed &nbsp;|&nbsp; Info@mg-visa.com · 17621</p>
          </div>
        </div>
        <dl className="cr-docmeta">
          <div><dt>Document</dt><dd>{documentType}</dd></div>
          <div><dt>Reference</dt><dd>{reference}</dd></div>
          <div><dt>Issued</dt><dd>{date}</dd></div>
        </dl>
      </header>

      <section className="cr-title">
        <h1>{title}</h1>
        <p className="cr-programme">{programme}</p>
        <p className="cr-client">Prepared for <strong dir="auto">{clientName}</strong></p>
      </section>

      <section className={`cr-score${score === null ? ' is-verdict' : ''}`} aria-label="Overall result">
        {score !== null && (
          <div className="cr-score-figure">
            <p className="cr-score-value">{fmt(score)}{scoreSuffix}</p>
            {scoreContext && <p className="cr-score-context">{scoreContext}</p>}
          </div>
        )}
        <div className="cr-score-verdict">
          <p className="cr-status"><span style={{ backgroundColor: status.color }} />{status.label}</p>
          <p className="cr-status-text">{status.description}</p>
        </div>
      </section>

      {attention.length > 0 && (
        <section className="cr-attention">
          <h2>Items requiring attention</h2>
          <ul>{attention.map(item => <li key={item}>{item}</li>)}</ul>
        </section>
      )}

      <div className="cr-overview">
        {composition.length > 0 && (
          <section>
            <h2>Score composition</h2>
            <ul className="cr-composition">
              {composition.map(item => (
                <li key={item.label}>
                  <div><span>{item.label}</span><strong>{fmt(item.earned)}<small> / {fmt(item.max)}</small></strong></div>
                  <Meter value={item.earned} max={item.max} />
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h2>Client details</h2>
          <dl className="cr-facts">
            {facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd dir="auto">{fact.value}</dd></div>)}
          </dl>
        </section>
      </div>

      <section className="cr-notes">
        <h2>Important information</h2>
        {notes.map(note => <p key={note}>{note}</p>)}
      </section>

      <div className="cr-details">
        <h2 className="cr-details-heading">{detailsHeading}</h2>
        {panelsFirst && panelList}
        {sections.map(section => {
          const t = sectionTotals(section)
          const scored = section.rows.some(row => row.earned !== null)
          return (
            <section key={section.key} className="cr-section">
              <div className="cr-section-head">
                <div>
                  <h3><span>{section.key}</span>{section.title}</h3>
                  <p>{section.caption}</p>
                </div>
                {scored && <p className="cr-section-total">{t.earned < 0 ? `−${fmt(-t.earned)}` : fmt(t.earned)}{t.max > 0 && <small> / {fmt(t.max)}</small>}</p>}
              </div>
              <table className="cr-table">
                <thead>
                  <tr><th scope="col">Factor</th><th scope="col">{scored ? 'Points' : 'Scoring'}</th><th scope="col"><span className="sr-only">Share of maximum</span></th></tr>
                </thead>
                <tbody>
                  {section.rows.map(row => (
                    <tr key={row.label} className={row.earned !== null && row.max === undefined ? 'is-adjustment' : undefined}>
                      <th scope="row">
                        <span className="cr-factor">{row.label}</span>
                        <span className="cr-claim" dir="auto">{row.claim}</span>
                        {row.note && <span className="cr-note">{row.note}</span>}
                      </th>
                      <td className="cr-points"><Points row={row} /></td>
                      <td className="cr-bar">{row.earned !== null && row.max !== undefined && <Meter value={row.earned} max={row.max} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )
        })}

        {total && (
          <div className="cr-grand-total">
            <span>{total.label}</span>
            <span className="cr-grand-figure"><strong>{total.value}</strong><small>{total.context}</small></span>
          </div>
        )}

        {!panelsFirst && panelList}

        <footer className="cr-signoff">
          <div><span className="cr-line" /><p>Reviewed by — MG Visa advisor</p></div>
          <div><span className="cr-line" /><p>Date</p></div>
          <div className="cr-contact">
            <p><strong>MG International Visa Consultancy</strong></p>
            <p>mg-visa.com · Info@mg-visa.com · Hotline 17621</p>
            <p>Confidential — prepared for <span dir="auto">{clientName}</span></p>
          </div>
        </footer>
      </div>
    </>
  )
}

/** Rendered into <body> and hidden on screen, so printing shows only this report. */
export function ClientReport(props: ClientReportProps) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <article className="cr-report" dir="ltr" lang="en" data-report={props.kind} aria-label={`${props.title} report for ${props.clientName}`}>
      <ReportBody {...props} />
    </article>,
    document.body,
  )
}
