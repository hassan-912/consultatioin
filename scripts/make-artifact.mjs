// Turns the single-file Vite build into page content for the claude.ai artifact skeleton
// (the publisher supplies <!doctype>, <html>, <head> and <body>).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const html = readFileSync('dist-artifact/index.html', 'utf8')
if (/supabase/i.test(html)) throw new Error('Artifact contains remote backend code or configuration')
const pick = re => [...html.matchAll(re)].map(m => m[0])
const title = '<title>MG Consultations</title>'
const links = pick(/<link[^>]+fonts\.(googleapis|gstatic)[^>]*>/g)
const styles = pick(/<style[^>]*>[\s\S]*?<\/style>/g)
const scripts = pick(/<script[^>]*>[\s\S]*?<\/script>/g)

const out = [
  title,
  '<meta name="theme-color" content="#222D35">',
  ...links,
  '<style>:root{color-scheme:light}html,body{background:#F6F7F9}</style>',
  ...styles,
  '<div id="root"></div>',
  ...scripts,
].join('\n')

mkdirSync('artifact', { recursive: true })
writeFileSync('artifact/mg-consultations.html', out)
console.log(`artifact/mg-consultations.html ${(out.length / 1024).toFixed(0)} KB, ${scripts.length} script(s), ${styles.length} style(s)`)
