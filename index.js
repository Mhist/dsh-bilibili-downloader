/**
 * Host half of the Bilibili uploader downloader bundle.
 *
 * One HTTP route (`/bilibili-downloader/api`) serves the sidebar panel, and two
 * agent tools expose the same operations. Both call the same job engine:
 *
 *  - resolve the uploader by UID (web card),
 *  - page through the space video list (WBI-signed),
 *  - resolve each video's play URL and stream it to `<title>.mp4`.
 *
 * Two transfer channels are supported. The DASH channel yields the best
 * quality but separates video and audio, so it requires ffmpeg to merge them;
 * the single-file channel asks Bilibili for a complete MP4 and needs no
 * external tool. Settings persist under the DSH home; the login cookie is kept
 * in the credential service when one is mounted.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Route prefix; the panel posts every operation here. */
const API_PATH = '/bilibili-downloader/api'
/** Request bodies are small JSON commands. */
const MAX_BODY_BYTES = 1024 * 1024
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const DATA_DIR = join(DSH_HOME, 'bilibili-downloader')
const SETTINGS_FILE = join(DATA_DIR, 'settings.json')
const FFMPEG_DIR = join(DATA_DIR, 'bin')
const FFMPEG_EXE = join(FFMPEG_DIR, 'ffmpeg.exe')
const FFMPEG_TMP_DIR = join(DATA_DIR, 'tmp-ffmpeg')
const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url))
/** A packager may drop a licensed ffmpeg build next to the package. */
const VENDOR_FFMPEG = join(PACKAGE_DIR, 'vendor', 'ffmpeg.exe')
/** Pinned static build fetched on first DASH download: size and SHA-256. */
const FFMPEG_DOWNLOAD_SIZE = 64_458_752
const FFMPEG_DOWNLOAD_SHA256 = 'c8abc49e7be62dde8e12972af373959e0076a7b8dc8040eb45978e0608f8781e'
const FFMPEG_MIRRORS = [
  'https://registry.npmmirror.com/@ffmpeg-installer/win32-x64/-/win32-x64-4.1.0.tgz',
  'https://registry.npmjs.org/@ffmpeg-installer/win32-x64/-/win32-x64-4.1.0.tgz',
]
const CREDENTIAL_KEY = 'bilibili-downloader'
const DEFAULT_OUTPUT_DIR = join(homedir(), 'Downloads', 'Bilibili')

/** Quality ids accepted by Bilibili's playurl, best first. */
const QUALITIES = [
  { id: '8k', qn: 127, label: '8K 超高清', hint: '需要大会员' },
  { id: '4k', qn: 120, label: '4K 超清', hint: '需要大会员' },
  { id: '1080p60', qn: 116, label: '1080P 60 帧', hint: '需要大会员' },
  { id: '1080p', qn: 80, label: '1080P 高清', hint: '需登录，最多 1080P' },
  { id: '720p', qn: 64, label: '720P 准高清', hint: '未登录一般最高 720P' },
  { id: '480p', qn: 32, label: '480P 清晰', hint: '占用小' },
  { id: '360p', qn: 16, label: '360P 流畅', hint: '占用最小' },
]
const QUALITY_BY_ID = new Map(QUALITIES.map(item => [item.id, item]))
const QUALITY_BY_QN = new Map(QUALITIES.map(item => [item.qn, item]))

const MODES = ['auto', 'dash', 'file']

/** from getMixinKey() in Bilibili's WBI bundle. */
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
]

/** Fingerprint parameters Bilibili's space API expects beside the signature. */
const DM_PARAMS = {
  dm_img_list: '[]',
  dm_img_str: 'V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ',
  dm_cover_img_str: 'QU5HTEUgKE5WSURJQSwgTlZJRElBIEdlRm9yY2UgR1RYIDEwNjAgNkdCIERpcmVjdDNEMTEgdnNfNV8wIHBzXzVfMCksIEdvb2dsZSBJbmMuIChOVklESUEp',
  dm_img_inter: '{"ds":[],"wh":[4096,4096,113],"of":[96,-2,3]}',
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

class BiliError extends Error {
  constructor(message, facts = {}) {
    super(message)
    this.name = 'BiliError'
    this.code = facts.code
    this.status = facts.status
  }
}

function baseHeaders(cookie) {
  const headers = {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: 'https://www.bilibili.com/',
    Origin: 'https://www.bilibili.com',
  }
  if (cookie) headers.Cookie = cookie
  return headers
}

async function httpJson(url, cookie, timeoutMs = 25_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { headers: baseHeaders(cookie), signal: controller.signal })
    const text = await response.text()
    if (response.status === 412) throw new BiliError('请求被 B 站风控拦截（412），请稍后重试或更新登录 Cookie。', { status: 412 })
    if (!response.ok) throw new BiliError(`B 站接口返回 HTTP ${response.status}，请稍后重试。`, { status: response.status })
    try {
      return JSON.parse(text)
    } catch {
      throw new BiliError('B 站返回了非 JSON 内容，通常是被风控拦截，请稍后重试。', { status: response.status })
    }
  } catch (error) {
    if (error && error.name === 'AbortError') throw new BiliError('请求 B 站超时，请检查网络后重试。')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/** One Bilibili API call: retries transient risk-control answers, then throws. */
async function biliJson(url, { cookie, retries = 2, timeoutMs = 25_000 } = {}) {
  let last
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let body
    try {
      body = await httpJson(url, cookie, timeoutMs)
    } catch (error) {
      last = error
      if (attempt === retries) throw error
      await sleep(900 * (attempt + 1))
      continue
    }
    if (body && body.code === 0) return body.data
    const code = body ? body.code : undefined
    last = new BiliError(body?.message || `B 站接口返回错误（${code}）`, { code })
    const retryable = code === -352 || code === -799 || code === -412 || code === -509
    if (retryable && attempt < retries) {
      await sleep((code === -799 ? 3200 : 1600) * (attempt + 1))
      continue
    }
    break
  }
  const code = last && last.code
  if (code === -352) throw new BiliError('请求被 B 站风控拦截（-352）。请稍后重试，并在面板中填写有效的登录 Cookie。', { code })
  if (code === -799) throw new BiliError('请求过于频繁（-799），请等待片刻后再试。', { code })
  if (code === -412) throw new BiliError('请求被 B 站拒绝（412），请稍后重试。', { code })
  if (code === -404 || code === -626) throw new BiliError('这个 UID 不存在或账号已注销。', { code })
  if (code === -403) throw new BiliError('没有访问权限（-403），该 UP 主可能关闭了主页展示。', { code })
  if (code === -101) throw new BiliError('Cookie 未登录或已过期，请重新填写。', { code })
  throw last instanceof Error ? last : new BiliError('B 站接口调用失败。', { code })
}

/* ------------------------------------------------------------------ */
/* Anonymous identity and WBI signing                                  */
/* ------------------------------------------------------------------ */

let buvidCache = { cookie: '', ts: 0 }
let wbiCache = { mixinKey: '', ts: 0 }

async function anonymousCookie() {
  if (buvidCache.cookie && Date.now() - buvidCache.ts < 30 * 60 * 1000) return buvidCache.cookie
  const data = await biliJson('https://api.bilibili.com/x/frontend/finger/spi', { retries: 1 })
  const b3 = data?.b_3
  const b4 = data?.b_4
  if (typeof b3 !== 'string' || typeof b4 !== 'string') throw new BiliError('无法获取 B 站匿名标识，请检查网络。')
  const cookie = `buvid3=${b3}; buvid4=${encodeURIComponent(b4)}; b_nut=${Math.floor(Date.now() / 1000)}`
  buvidCache = { cookie, ts: Date.now() }
  return cookie
}

async function effectiveCookie(userCookie) {
  const anonymous = await anonymousCookie()
  const trimmed = typeof userCookie === 'string' ? userCookie.trim().replace(/;$/, '') : ''
  return trimmed ? `${trimmed}; ${anonymous}` : anonymous
}

/** `/nav` answers `code: -101` for anonymous requests while still carrying the WBI keys. */
async function navInfo(cookie, timeoutMs = 15_000) {
  const body = await httpJson('https://api.bilibili.com/x/web-interface/nav', cookie, timeoutMs)
  if (body && (body.code === 0 || body.code === -101)) return body.data ?? {}
  throw new BiliError(body?.message || '无法读取 B 站登录状态。', { code: body?.code })
}

async function wbiMixinKey(cookie) {
  if (wbiCache.mixinKey && Date.now() - wbiCache.ts < 10 * 60 * 1000) return wbiCache.mixinKey
  const data = await navInfo(cookie)
  const img = String(data?.wbi_img?.img_url ?? '')
  const sub = String(data?.wbi_img?.sub_url ?? '')
  const raw = img.split('/').pop().split('.')[0] + sub.split('/').pop().split('.')[0]
  if (raw.length < 64) throw new BiliError('无法获取 B 站签名密钥，请检查网络。')
  const mixinKey = MIXIN_KEY_ENC_TAB.map(index => raw[index]).join('').slice(0, 32)
  wbiCache = { mixinKey, ts: Date.now() }
  return mixinKey
}

function wbiSign(params, mixinKey) {
  const all = { ...params, wts: Math.round(Date.now() / 1000) }
  const query = Object.keys(all)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(all[key]).replace(/[!'()*]/g, ''))}`)
    .join('&')
  return `${query}&w_rid=${createHash('md5').update(query + mixinKey).digest('hex')}`
}

/* ------------------------------------------------------------------ */
/* Settings and credentials                                            */
/* ------------------------------------------------------------------ */

const SETTING_KEYS = ['quality', 'mode', 'outputDir', 'concurrency', 'includeParts', 'ffmpegPath']

function normalizeQuality(value) {
  if (typeof value === 'number' && QUALITY_BY_QN.has(value)) return QUALITY_BY_QN.get(value)
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase()
    if (QUALITY_BY_ID.has(key)) return QUALITY_BY_ID.get(key)
    const numeric = Number(key)
    if (Number.isFinite(numeric) && QUALITY_BY_QN.has(numeric)) return QUALITY_BY_QN.get(numeric)
  }
  return QUALITY_BY_ID.get('1080p')
}

function normalizeMode(value) {
  return MODES.includes(value) ? value : 'auto'
}

function normalizeConcurrency(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 2
  return Math.min(4, Math.max(1, Math.round(numeric)))
}

function normalizeOutputDir(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return DEFAULT_OUTPUT_DIR
  const expanded = text.startsWith('~') ? join(homedir(), text.slice(1)) : text
  return resolvePath(expanded)
}

function defaultSettings() {
  return {
    quality: '1080p',
    mode: 'auto',
    outputDir: DEFAULT_OUTPUT_DIR,
    concurrency: 2,
    includeParts: true,
    ffmpegPath: '',
  }
}

async function readSettings() {
  let stored = {}
  try {
    const text = (await readFile(SETTINGS_FILE, 'utf8')).replace(/^\uFEFF/, '')
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object') stored = parsed
  } catch {
    // No settings file is the normal first-run state.
  }
  const defaults = defaultSettings()
  return {
    quality: normalizeQuality(stored.quality ?? defaults.quality).id,
    mode: normalizeMode(stored.mode ?? defaults.mode),
    outputDir: normalizeOutputDir(stored.outputDir ?? defaults.outputDir),
    concurrency: normalizeConcurrency(stored.concurrency ?? defaults.concurrency),
    includeParts: typeof stored.includeParts === 'boolean' ? stored.includeParts : defaults.includeParts,
    ffmpegPath: typeof stored.ffmpegPath === 'string' ? stored.ffmpegPath : '',
  }
}

async function writeSettings(patch) {
  const current = await readSettings()
  let extra = {}
  try {
    const parsed = JSON.parse((await readFile(SETTINGS_FILE, 'utf8')).replace(/^\uFEFF/, ''))
    if (parsed && typeof parsed === 'object') extra = parsed
  } catch {
    // Settings file may not exist yet.
  }
  const next = { ...current }
  for (const key of SETTING_KEYS) {
    if (patch[key] !== undefined) next[key] = patch[key]
  }
  // Preserve fields this writer does not own, such as a fallback cookie.
  if (typeof extra.cookie === 'string' && extra.cookie) next.cookie = extra.cookie
  next.quality = normalizeQuality(next.quality).id
  next.mode = normalizeMode(next.mode)
  next.outputDir = normalizeOutputDir(next.outputDir)
  next.concurrency = normalizeConcurrency(next.concurrency)
  next.includeParts = next.includeParts !== false
  next.ffmpegPath = typeof next.ffmpegPath === 'string' ? next.ffmpegPath.trim() : ''
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8')
  return next
}

function credentialService(ctx) {
  try {
    const direct = typeof ctx.get === 'function' ? ctx.get('credentials') : undefined
    if (direct) return direct
  } catch {
    // Service lookup can fail during teardown; fall through.
  }
  const reflected = Reflect.get(ctx, 'credentials')
  return reflected && typeof reflected === 'object' ? reflected : undefined
}

/** Accept a bare SESSDATA value as well as a full cookie string. */
function normalizeCookieInput(value) {
  const text = typeof value === 'string' ? value.trim().replace(/;$/, '') : ''
  if (!text) return ''
  if (!text.includes('=')) return `SESSDATA=${text}`
  return text
}

async function readCookieFromStore(ctx) {
  try {
    const credentials = credentialService(ctx)
    if (!credentials) return undefined
    const record = await credentials.readRecord(CREDENTIAL_KEY)
    if (record && record.kind === 'api-key' && typeof record.key === 'string' && record.key.trim()) {
      return record.key.trim()
    }
  } catch {
    // A missing credential service or store is not fatal.
  }
  return undefined
}

/** Effective login cookie: credential store, then env/config, then settings file. */
async function readLoginCookie(ctx, config) {
  const stored = await readCookieFromStore(ctx)
  if (stored) return normalizeCookieInput(stored)
  const fromEnv = typeof process.env.BILIBILI_SESSDATA === 'string' ? process.env.BILIBILI_SESSDATA.trim() : ''
  if (fromEnv) return normalizeCookieInput(fromEnv)
  const fromConfig = typeof config?.cookie === 'string' ? config.cookie.trim() : ''
  if (fromConfig) return normalizeCookieInput(fromConfig)
  try {
    const text = (await readFile(SETTINGS_FILE, 'utf8')).replace(/^\uFEFF/, '')
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed.cookie === 'string' && parsed.cookie.trim()) return normalizeCookieInput(parsed.cookie)
  } catch {
    // No stored cookie.
  }
  return ''
}

async function saveLoginCookie(ctx, cookie) {
  const value = normalizeCookieInput(cookie)
  try {
    const credentials = credentialService(ctx)
    if (credentials) {
      if (!value) {
        await credentials.deleteRecord(CREDENTIAL_KEY)
        return { saved: true, source: 'credentials' }
      }
      await credentials.modifyRecord(CREDENTIAL_KEY, async () => ({ kind: 'api-key', key: value }))
      return { saved: true, source: 'credentials' }
    }
  } catch (error) {
    // Fall through to the settings file so the panel still works.
  }
  const current = await readSettings()
  await mkdir(DATA_DIR, { recursive: true })
  const stored = { ...current, cookie: value }
  await writeFile(SETTINGS_FILE, JSON.stringify(stored, null, 2), 'utf8')
  return { saved: true, source: 'settings' }
}

/* ------------------------------------------------------------------ */
/* Bilibili reads                                                      */
/* ------------------------------------------------------------------ */

async function resolveUser(uid, cookie) {
  const data = await biliJson(`https://api.bilibili.com/x/web-interface/card?mid=${encodeURIComponent(uid)}`, { cookie, retries: 1 })
  const card = data?.card
  if (!card || !card.mid) throw new BiliError('没有找到这个 UID 对应的 UP 主。')
  return {
    uid: String(card.mid),
    name: typeof card.name === 'string' ? card.name : `UID ${uid}`,
    face: typeof card.face === 'string' ? card.face.replace(/^http:/, 'https:') : '',
    sign: typeof card.sign === 'string' ? card.sign : '',
    fans: typeof data.follower === 'number' ? data.follower : undefined,
  }
}

/** Page through the uploader's video list; `total` comes from the first page. */
async function listUserVideos(uid, { cookie, max = 5000, onPage } = {}) {
  const videos = []
  let total = 0
  for (let page = 1; page <= 200; page += 1) {
    const mixinKey = await wbiMixinKey(cookie)
    const query = wbiSign({
      keyword: '',
      mid: String(uid),
      order: 'pubdate',
      order_avoided: 'true',
      platform: 'web',
      pn: page,
      ps: 30,
      tid: 0,
      web_location: '333.1387',
      special_type: '',
      index: 0,
      ...DM_PARAMS,
    }, mixinKey)
    const data = await biliJson(`https://api.bilibili.com/x/space/wbi/arc/search?${query}`, { cookie })
    const list = data?.list?.vlist
    if (page === 1) total = Number(data?.page?.count ?? 0) || 0
    if (!Array.isArray(list) || list.length === 0) break
    for (const entry of list) {
      const meta = entry?.meta ?? {}
      if (meta.attribute === 156) continue // hidden collection rows have no bvid of their own
      if (typeof entry?.bvid !== 'string' || !entry.bvid) continue
      videos.push({
        bvid: entry.bvid,
        aid: entry.aid,
        title: String(entry.title ?? entry.bvid),
        cover: typeof entry.pic === 'string' ? entry.pic.replace(/^http:/, 'https:') : '',
        duration: String(entry.length ?? ''),
        publishedAt: typeof entry.created === 'number' ? entry.created * 1000 : undefined,
      })
      if (videos.length >= max) break
    }
    if (onPage) onPage({ page, total, collected: videos.length })
    if (videos.length >= max) break
    if (total > 0 && page * 30 >= total) break
  }
  return { total: Math.max(total, videos.length), videos }
}

async function listVideoPages(bvid, cookie) {
  const data = await biliJson(`https://api.bilibili.com/x/player/pagelist?bvid=${encodeURIComponent(bvid)}`, { cookie, retries: 1 })
  if (!Array.isArray(data)) return []
  return data.map(entry => ({
    cid: entry.cid,
    page: Number(entry.page) || 1,
    part: String(entry.part ?? ''),
    duration: Number(entry.duration) || 0,
  }))
}

async function requestPlayurl(bvid, cid, qn, cookie, variant) {
  const mixinKey = await wbiMixinKey(cookie)
  const params = {
    bvid,
    cid: String(cid),
    qn: String(qn),
    fnver: '0',
    fourk: '1',
    fnval: variant.fnval,
    platform: variant.platform,
    ...DM_PARAMS,
  }
  if (variant.highQuality) params.high_quality = '1'
  const query = wbiSign(params, mixinKey)
  return biliJson(`https://api.bilibili.com/x/player/wbi/playurl?${query}`, { cookie })
}

function dashResult(data, qn) {
  const dash = data?.dash
  if (!dash || !Array.isArray(dash.video) || dash.video.length === 0) return undefined
  const withUrl = stream => typeof stream?.baseUrl === 'string' || typeof stream?.base_url === 'string'
  const candidates = dash.video.filter(stream => withUrl(stream) && Number(stream.id) <= qn)
  const pool = candidates.length > 0 ? candidates : dash.video.filter(withUrl)
  if (pool.length === 0) return undefined
  const bestId = Math.max(...pool.map(stream => Number(stream.id) || 0))
  const same = pool.filter(stream => (Number(stream.id) || 0) === bestId)
  const video = same.find(stream => /^avc1/i.test(String(stream.codecs ?? '')))
    ?? same.find(stream => /^(hev1|hvc1)/i.test(String(stream.codecs ?? '')))
    ?? same[0]
  const audios = (Array.isArray(dash.audio) ? dash.audio : []).filter(withUrl)
  audios.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
  const audio = audios[0]
  if (!audio) return undefined
  return {
    kind: 'dash',
    /* The selected stream id is the quality actually delivered; data.quality is the request echo. */
    quality: Number(video.id) || Number(data.quality) || qn,
    video: { urls: urlsOf(video), size: Number(video.size) || undefined },
    audio: { urls: urlsOf(audio), size: Number(audio.size) || undefined },
    size: (Number(video.size) || 0) + (Number(audio.size) || 0),
  }
}

function fileResult(data, qn) {
  const format = String(data?.format ?? '')
  /* Only complete MP4 segments keep the `.mp4` name truthful; FLV durl is skipped. */
  if (format && !/^mp4/i.test(format)) return undefined
  const durl = Array.isArray(data?.durl) ? data.durl.filter(entry => typeof entry?.url === 'string') : []
  if (durl.length === 0) return undefined
  const segments = durl.map(entry => [entry.url, ...(Array.isArray(entry.backup_url) ? entry.backup_url : [])])
  return {
    kind: 'file',
    quality: Number(data.quality) || qn,
    urls: segments[0],
    segments,
    size: durl.reduce((sum, entry) => sum + (Number(entry.size) || 0), 0) || undefined,
  }
}

/**
 * Ask Bilibili for the playable variant closest to `qn`.
 *
 * The single-file channel has no single canonical request: the PC variant can
 * expose 1080P to a signed-in account, while the html5 variant caps lower but
 * still serves complete MP4 files. Ask both and keep the best quality.
 */
async function resolvePlay(bvid, cid, qn, kind, cookie) {
  if (kind === 'dash') {
    const data = await requestPlayurl(bvid, cid, qn, cookie, { fnval: '4048', platform: 'pc' })
    return dashResult(data, qn)
  }
  let best
  let firstError
  for (const variant of [
    { fnval: '1', platform: 'pc' },
    { fnval: '1', platform: 'html5', highQuality: true },
  ]) {
    let data
    try {
      data = await requestPlayurl(bvid, cid, qn, cookie, variant)
    } catch (error) {
      firstError = firstError || error
      continue
    }
    const result = fileResult(data, qn)
    if (!result) continue
    if (!best || result.quality > best.quality) best = result
    if (best.quality >= qn) break
  }
  if (!best && firstError) throw firstError
  return best
}

function urlsOf(stream) {
  const base = stream.baseUrl ?? stream.base_url
  const backup = Array.isArray(stream.backupUrl) ? stream.backupUrl : (Array.isArray(stream.backup_url) ? stream.backup_url : [])
  return [base, ...backup].filter(url => typeof url === 'string' && url)
}

/** Report the qualities Bilibili actually offers for one uploader's newest video. */
async function probeVideoQualities(bvid, cookie) {
  try {
    const pages = await listVideoPages(bvid, cookie)
    if (pages.length === 0) return []
    const data = await requestPlayurl(bvid, pages[0].cid, 127, cookie, { fnval: '4048', platform: 'pc' })
    const formats = Array.isArray(data?.support_formats) ? data.support_formats : []
    const seen = new Set()
    const result = []
    for (const format of formats) {
      const qn = Number(format?.quality)
      if (!Number.isFinite(qn) || seen.has(qn)) continue
      seen.add(qn)
      result.push({
        quality: qn,
        id: (QUALITY_BY_QN.get(qn) ?? {}).id,
        label: String(format?.new_description ?? format?.display_desc ?? ''),
      })
    }
    return result.sort((a, b) => b.quality - a.quality)
  } catch {
    return []
  }
}

/* ------------------------------------------------------------------ */
/* Transfers                                                           */
/* ------------------------------------------------------------------ */

async function fileSize(path) {
  try {
    const info = await stat(path)
    return info.isFile() ? info.size : 0
  } catch {
    return 0
  }
}

function isAbort(error) {
  return Boolean(error) && (error.name === 'AbortError' || error.code === 'ABORT_ERR' || error.message === 'canceled')
}

/**
 * Stream one URL list into `dest`, resuming a leftover `.part` file when the
 * server honors a Range request. Falls through the backup URLs on 403/404.
 */
async function downloadTo(dest, urls, { signal, onProgress } = {}) {
  const part = `${dest}.part`
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let start = await fileSize(part)
    if (signal?.aborted) throw new BiliError('canceled')
    try {
      for (const url of urls) {
        const headers = {
          'User-Agent': UA,
          Referer: 'https://www.bilibili.com/',
          ...(start > 0 ? { Range: `bytes=${start}-` } : {}),
        }
        const response = await fetch(url, { headers, signal })
        if (response.status === 416 && start > 0) {
          // The leftover part already holds the whole file.
          await rm(dest, { force: true })
          await rename(part, dest)
          return
        }
        if (response.status === 403 || response.status === 404) {
          lastError = new BiliError(`下载地址失效（HTTP ${response.status}）`, { status: response.status })
          continue
        }
        if (!response.ok && response.status !== 206) {
          throw new BiliError(`下载失败（HTTP ${response.status}）`, { status: response.status })
        }
        if (start > 0 && response.status !== 206) start = 0
        const total = totalBytesOf(response, start)
        const handle = await open(part, start > 0 ? 'a' : 'w')
        let received = start
        try {
          const reader = response.body?.getReader()
          if (!reader) throw new BiliError('下载响应没有内容。')
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            if (signal?.aborted) throw new BiliError('canceled')
            if (value && value.length > 0) {
              await handle.write(value)
              received += value.length
              if (onProgress) onProgress(received, total)
            }
          }
        } finally {
          await handle.close()
        }
        if (total > 0 && received < total) throw new BiliError('下载不完整，正在重试。')
        await rm(dest, { force: true })
        await rename(part, dest)
        return
      }
      throw lastError ?? new BiliError('没有可用的下载地址。')
    } catch (error) {
      if (isAbort(error) || signal?.aborted) throw new BiliError('canceled')
      lastError = error
      if (attempt === 2) throw error
      await sleep(1200 * (attempt + 1))
    }
  }
  throw lastError ?? new BiliError('下载失败。')
}

function totalBytesOf(response, start) {
  const range = response.headers.get('content-range')
  if (range) {
    const match = /\/(\d+)$/.exec(range)
    if (match) return Number(match[1])
  }
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > 0) return length + (response.status === 206 ? start : 0)
  return 0
}

/** A segmented `durl` answer: fetch every segment, then append them in order. */
async function downloadSegments(dest, segments, { signal, onProgress } = {}) {
  const temps = []
  let settledBytes = 0
  try {
    for (let index = 0; index < segments.length; index += 1) {
      const temp = `${dest}.seg${index + 1}`
      await downloadTo(temp, segments[index], {
        signal,
        onProgress: bytes => {
          if (onProgress) onProgress(settledBytes + bytes, 0)
        },
      })
      settledBytes += await fileSize(temp)
      temps.push(temp)
    }
    const handle = await open(dest, 'w')
    try {
      for (const temp of temps) {
        for await (const chunk of createReadStream(temp)) await handle.write(chunk)
      }
    } finally {
      await handle.close()
    }
    if (onProgress) onProgress(settledBytes, settledBytes)
  } finally {
    for (const temp of temps) await rm(temp, { force: true }).catch(() => {})
  }
}

/* ------------------------------------------------------------------ */
/* ffmpeg                                                              */
/* ------------------------------------------------------------------ */

let ffmpegCache = { value: undefined, ts: 0 }

async function detectFfmpeg(configured) {
  if (ffmpegCache.value !== undefined && Date.now() - ffmpegCache.ts < 60_000) return ffmpegCache.value
  const candidates = []
  const explicit = typeof configured === 'string' ? configured.trim() : ''
  if (explicit) candidates.push(explicit)
  if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH)
  candidates.push('ffmpeg')
  /* A newly installed ffmpeg is often outside this long-running process's PATH. */
  const localAppData = process.env.LOCALAPPDATA || ''
  const userProfile = process.env.USERPROFILE || homedir()
  candidates.push(
    FFMPEG_EXE,
    VENDOR_FFMPEG,
    join(localAppData, 'dsh-ffmpeg', 'bin', 'ffmpeg.exe'),
    join(localAppData, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
    join(userProfile, 'scoop', 'shims', 'ffmpeg.exe'),
    'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
  )
  for (const candidate of candidates) {
    if (!candidate) continue
    if (candidate.includes('/') || candidate.includes('\\')) {
      if (!existsSync(candidate)) continue
    }
    const found = await probeFfmpeg(candidate)
    if (found) {
      ffmpegCache = { value: { found: true, path: candidate }, ts: Date.now() }
      return ffmpegCache.value
    }
  }
  ffmpegCache = { value: { found: false, path: '' }, ts: Date.now() }
  return ffmpegCache.value
}

function probeFfmpeg(command) {
  return new Promise(resolve => {
    let settled = false
    let child
    try {
      child = spawn(command, ['-version'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    } catch {
      resolve(false)
      return
    }
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { child.kill() } catch { /* ignore */ }
      resolve(false)
    }, 4000)
    child.on('error', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(false)
    })
    child.on('close', code => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(code === 0)
    })
  })
}

function runProcess(command, args) {
  return new Promise(resolve => {
    let child
    try {
      child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    } catch (error) {
      resolve({ code: -1, stderr: error instanceof Error ? error.message : String(error) })
      return
    }
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => {
      if (stderr.length < 4000) stderr += chunk
    })
    child.on('error', error => resolve({ code: -1, stderr: error.message }))
    child.on('close', code => resolve({ code, stderr }))
  })
}

async function downloadFile(url, dest) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA } })
  if (!response.ok) throw new BiliError(`下载失败（HTTP ${response.status}）`, { status: response.status })
  const handle = await open(dest, 'w')
  try {
    const reader = response.body?.getReader()
    if (!reader) throw new BiliError('下载响应没有内容。')
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value && value.length > 0) await handle.write(value)
    }
  } finally {
    await handle.close()
  }
}

function sha256File(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

/**
 * Fetch the pinned static ffmpeg build into the plugin data directory, verifying
 * its size and SHA-256 before use. Open-source users therefore never need to
 * install ffmpeg themselves.
 */
async function installFfmpeg() {
  if (process.platform !== 'win32') {
    throw new BiliError('自动下载 ffmpeg 目前只支持 Windows。请手动安装 ffmpeg，并在设置里填写可执行文件路径。')
  }
  await mkdir(FFMPEG_TMP_DIR, { recursive: true })
  let lastError
  for (const url of FFMPEG_MIRRORS) {
    const tarball = join(FFMPEG_TMP_DIR, 'ffmpeg.tgz')
    try {
      await rm(tarball, { force: true })
      await downloadFile(url, tarball)
      const extractDir = join(FFMPEG_TMP_DIR, 'extract')
      await rm(extractDir, { recursive: true, force: true })
      await mkdir(extractDir, { recursive: true })
      const extracted = join(extractDir, 'package', 'ffmpeg.exe')
      const tar = await runProcess('tar', ['-xzf', tarball, '-C', extractDir])
      if (tar.code !== 0) throw new BiliError(`解压失败：${tar.stderr.slice(0, 200) || `退出码 ${tar.code}`}`)
      const size = await fileSize(extracted)
      if (size !== FFMPEG_DOWNLOAD_SIZE) throw new BiliError(`下载的 ffmpeg 大小不符（${size} 字节）`)
      const digest = await sha256File(extracted)
      if (digest !== FFMPEG_DOWNLOAD_SHA256) throw new BiliError('下载的 ffmpeg 校验失败')
      await mkdir(FFMPEG_DIR, { recursive: true })
      await rm(FFMPEG_EXE, { force: true })
      await rename(extracted, FFMPEG_EXE)
      await rm(FFMPEG_TMP_DIR, { recursive: true, force: true })
      ffmpegCache = { value: { found: true, path: FFMPEG_EXE }, ts: Date.now() }
      return { found: true, path: FFMPEG_EXE }
    } catch (error) {
      lastError = error
    }
  }
  await rm(FFMPEG_TMP_DIR, { recursive: true, force: true }).catch(() => {})
  throw new BiliError(`自动下载 ffmpeg 失败：${lastError instanceof Error ? lastError.message : '未知错误'}。请手动安装 ffmpeg 并在设置里填写路径。`)
}

/** Detect ffmpeg, optionally fetching the pinned build when DASH needs it. */
async function ensureFfmpeg(config, { download = false } = {}) {
  const detected = await detectFfmpeg(config?.ffmpegPath)
  if (detected.found || !download) return detected
  const installed = await installFfmpeg()
  ffmpegCache = { value: installed, ts: Date.now() }
  return installed
}

function mergeWithFfmpeg(ffmpegPath, videoPath, audioPath, outputPath) {
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(ffmpegPath, ['-y', '-loglevel', 'error', '-i', videoPath, '-i', audioPath, '-c', 'copy', '-movflags', '+faststart', outputPath], {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      })
    } catch (error) {
      reject(new BiliError(`无法启动 ffmpeg：${error.message}`))
      return
    }
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => {
      if (stderr.length < 8000) stderr += chunk
    })
    child.on('error', error => reject(new BiliError(`无法启动 ffmpeg：${error.message}`)))
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new BiliError(`ffmpeg 合并失败：${stderr.trim().split(/\r?\n/).slice(-2).join(' ') || `退出码 ${code}`}`))
    })
  })
}

/* ------------------------------------------------------------------ */
/* Jobs                                                                */
/* ------------------------------------------------------------------ */

const jobs = new Map()
let jobSeq = 0

function sanitizeName(value, fallback = 'video') {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  const clipped = text.slice(0, 120).trim()
  return clipped || fallback
}

function qualityById(id) {
  return QUALITY_BY_ID.get(id) ?? QUALITY_BY_ID.get('1080p')
}

function snapshot(job, options = {}) {
  const base = {
    id: job.id,
    uid: job.uid,
    uname: job.uname,
    face: job.face,
    state: job.state,
    message: job.message,
    note: job.note || '',
    total: job.total,
    done: job.done,
    failed: job.failed,
    skipped: job.skipped,
    pending: job.items.filter(item => item.state === 'pending').length,
    quality: job.quality.id,
    qualityLabel: job.quality.label,
    requestedMode: job.requestedMode,
    mode: job.mode,
    outputDir: job.outputDir,
    folder: job.folder,
    includeParts: job.includeParts,
    overwrite: job.overwrite,
    concurrency: job.concurrency,
    current: job.current,
    currentFile: job.currentFile,
    currentBytes: job.currentBytes,
    currentTotal: job.currentTotal,
    totalBytes: job.totalBytes,
    achievedQuality: job.achievedQn ? (QUALITY_BY_QN.get(job.achievedQn) ?? {}).id : undefined,
    qualityCapped: Boolean(job.quality && job.achievedQn && job.achievedQn < job.quality.qn),
    startedAt: job.startedAt,
    finishedAt: job.finishedAt || undefined,
    canceled: job.canceled,
  }
  if (options.items === false) return base
  const settled = job.items.filter(item => item.state !== 'pending')
  const window = settled.slice(-80)
  const running = job.items.filter(item => item.state === 'running' && !window.includes(item))
  return {
    ...base,
    items: [...window, ...running].map(item => ({
      bvid: item.bvid,
      title: item.title,
      state: item.state,
      quality: item.qualityId,
      qualityLabel: item.qualityLabel,
      files: item.files,
      error: item.error,
    })),
    itemsTruncated: settled.length > window.length,
  }
}

async function startJob({ uid, quality, mode, outputDir, includeParts, overwrite, limit, concurrency, cookie, config }) {
  const cleanUid = String(uid ?? '').trim()
  if (!/^\d{1,20}$/.test(cleanUid)) throw new BiliError('请输入正确的 UP 主 UID（纯数字）。')
  if (!cookie) {
    throw new BiliError('获取 UP 主视频列表需要登录 Cookie。请先在面板的「登录 Cookie」里填入 SESSDATA，再开始下载。')
  }
  const active = [...jobs.values()].find(job => job.state === 'listing' || job.state === 'running')
  if (active) {
    throw new BiliError(`已有一个下载任务在运行（${active.uname}），请先停止或等待它完成。`)
  }
  const requestedMode = normalizeMode(mode)
  let ffmpeg = await detectFfmpeg(config?.ffmpegPath)
  let autoInstallFailure = ''
  if (!ffmpeg.found && requestedMode !== 'file') {
    try {
      ffmpeg = await ensureFfmpeg(config, { download: true })
    } catch (error) {
      autoInstallFailure = error instanceof Error ? error.message : '自动下载 ffmpeg 失败'
      ffmpeg = { found: false, path: '' }
    }
  }
  const effectiveMode = requestedMode === 'auto' ? (ffmpeg.found ? 'dash' : 'file') : requestedMode
  if (effectiveMode === 'dash' && !ffmpeg.found) {
    throw new BiliError('DASH 通道需要 ffmpeg 才能合并音视频。请安装 ffmpeg 并在设置里填写路径，或把通道改为「自动 / 单文件 MP4」。')
  }

  const user = await resolveUser(cleanUid, cookie)
  const destination = normalizeOutputDir(outputDir)
  const folder = join(destination, sanitizeName(user.name, `UID${cleanUid}`))
  try {
    await mkdir(folder, { recursive: true })
  } catch (error) {
    throw new BiliError(`无法创建保存目录 ${folder}：${error instanceof Error ? error.message : '未知错误'}`)
  }

  const job = {
    id: `bd-${Date.now().toString(36)}-${(jobSeq++).toString(36)}`,
    uid: cleanUid,
    uname: user.name,
    face: user.face,
    quality: qualityById(normalizeQuality(quality).id),
    requestedMode,
    mode: effectiveMode,
    ffmpegPath: ffmpeg.found ? ffmpeg.path : '',
    outputDir: destination,
    folder,
    includeParts: includeParts !== false,
    overwrite: overwrite === true,
    limit: Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 0,
    concurrency: normalizeConcurrency(concurrency),
    state: 'listing',
    message: '正在获取视频列表…',
    note: autoInstallFailure
      ? `自动安装 ffmpeg 失败（${autoInstallFailure}），已退回单文件 MP4 通道，最高约 720P。`
      : '',
    total: 0,
    done: 0,
    failed: 0,
    skipped: 0,
    items: [],
    current: null,
    currentFile: '',
    currentBytes: 0,
    currentTotal: 0,
    totalBytes: 0,
    achievedQn: 0,
    canceled: false,
    startedAt: Date.now(),
    finishedAt: 0,
  }
  jobs.set(job.id, job)
  const controller = new AbortController()
  job.controller = controller
  runJob(job, cookie, controller.signal).catch(error => {
    if (job.state === 'canceled') return
    job.state = 'failed'
    job.message = error instanceof Error ? error.message : '下载失败'
    job.finishedAt = Date.now()
  })
  return job
}

/**
 * Resolve a pasted link (bilibili.com, b23.tv short link), a bare BV id, or an
 * av id into the metadata needed for a single-video download.
 */
async function resolveVideoTarget(input, cookie) {
  const text = String(input ?? '').trim()
  if (!text) throw new BiliError('请输入 B 站视频链接、BV 号或 av 号。')
  let bvid = /(BV[0-9A-Za-z]{10})/.exec(text)?.[1] ?? ''
  let aid = 0
  if (!bvid) {
    const avMatch = /(?:^|[/\s])av(\d+)(?:\b|$)/i.exec(text)
    if (avMatch) aid = Number(avMatch[1])
  }
  if (!bvid && !aid && /b23\.tv|bilibili\.com/i.test(text)) {
    try {
      const response = await fetch(/^https?:\/\//i.test(text) ? text : `https://${text}`, {
        redirect: 'follow',
        headers: { 'User-Agent': UA },
      })
      const final = /(BV[0-9A-Za-z]{10})/.exec(response.url || '')
      if (final) bvid = final[1]
    } catch {
      // Fall through to the explanatory error below.
    }
  }
  if (!bvid && !aid) throw new BiliError('没有从输入里识别出视频，请粘贴 B 站视频链接、BV 号或 av 号。')
  const query = bvid ? `bvid=${encodeURIComponent(bvid)}` : `aid=${aid}`
  const data = await biliJson(`https://api.bilibili.com/x/web-interface/view?${query}`, { cookie, retries: 1 })
  if (!data || typeof data.bvid !== 'string') throw new BiliError('没有找到这个视频，可能已删除或需要登录。')
  return {
    bvid: data.bvid,
    aid: data.aid,
    title: String(data.title ?? data.bvid),
    ownerName: typeof data.owner?.name === 'string' ? data.owner.name : '',
    ownerUid: data.owner?.mid ? String(data.owner.mid) : '',
  }
}

async function startDirectJob({ url, quality, mode, outputDir, overwrite, cookie, config }) {
  const active = [...jobs.values()].find(job => job.state === 'listing' || job.state === 'running')
  if (active) {
    throw new BiliError(`已有一个下载任务在运行（${active.uname}），请先停止或等待它完成。`)
  }
  const requestedMode = normalizeMode(mode)
  let ffmpeg = await detectFfmpeg(config?.ffmpegPath)
  let autoInstallFailure = ''
  if (!ffmpeg.found && requestedMode !== 'file') {
    try {
      ffmpeg = await ensureFfmpeg(config, { download: true })
    } catch (error) {
      autoInstallFailure = error instanceof Error ? error.message : '自动下载 ffmpeg 失败'
      ffmpeg = { found: false, path: '' }
    }
  }
  const effectiveMode = requestedMode === 'auto' ? (ffmpeg.found ? 'dash' : 'file') : requestedMode
  if (effectiveMode === 'dash' && !ffmpeg.found) {
    throw new BiliError('DASH 通道需要 ffmpeg 才能合并音视频。请安装 ffmpeg 并在设置里填写路径，或把通道改为「自动 / 单文件 MP4」。')
  }
  const target = await resolveVideoTarget(url, cookie)
  const destination = normalizeOutputDir(outputDir)
  const folder = join(destination, sanitizeName(target.ownerName, target.ownerUid ? `UID${target.ownerUid}` : 'Bilibili'))
  try {
    await mkdir(folder, { recursive: true })
  } catch (error) {
    throw new BiliError(`无法创建保存目录 ${folder}：${error instanceof Error ? error.message : '未知错误'}`)
  }
  const plain = sanitizeName(target.title, target.bvid)
  /* A different video with the same title keeps its own file. */
  const baseName = (await fileSize(join(folder, `${plain}.mp4`))) > 0 ? `${plain} [${target.bvid}]` : plain

  const job = {
    id: `bd-${Date.now().toString(36)}-${(jobSeq++).toString(36)}`,
    uid: target.ownerUid,
    uname: target.ownerName || 'Bilibili',
    face: '',
    quality: qualityById(normalizeQuality(quality).id),
    requestedMode,
    mode: effectiveMode,
    ffmpegPath: ffmpeg.found ? ffmpeg.path : '',
    outputDir: destination,
    folder,
    includeParts: true,
    overwrite: overwrite === true,
    limit: 1,
    concurrency: 1,
    state: 'running',
    message: '准备下载 1 个视频',
    note: autoInstallFailure
      ? `自动安装 ffmpeg 失败（${autoInstallFailure}），已退回单文件 MP4 通道，最高约 720P。`
      : '',
    total: 1,
    done: 0,
    failed: 0,
    skipped: 0,
    items: [{
      bvid: target.bvid,
      title: target.title,
      state: 'pending',
      files: 0,
      qualityId: '',
      qualityLabel: '',
      error: '',
      baseName,
    }],
    current: null,
    currentFile: '',
    currentBytes: 0,
    currentTotal: 0,
    totalBytes: 0,
    achievedQn: 0,
    canceled: false,
    startedAt: Date.now(),
    finishedAt: 0,
  }
  jobs.set(job.id, job)
  const controller = new AbortController()
  job.controller = controller
  runDirectJob(job, cookie, controller.signal).catch(error => {
    if (job.state === 'canceled') return
    job.state = 'failed'
    job.message = error instanceof Error ? error.message : '下载失败'
    job.finishedAt = Date.now()
  })
  return job
}

async function runDirectJob(job, cookie, signal) {
  await runWorkerPool(job, cookie, signal)
  finishJob(job)
}

/**
 * Two different uploads can share one title. The first keeps the plain name and
 * every later duplicate gets its BV id appended, so each video owns one file
 * instead of being skipped as "already exists".
 */function assignUniqueNames(items) {
  const seen = new Map()
  for (const item of items) {
    const base = sanitizeName(item.title, item.bvid)
    const count = seen.get(base) || 0
    seen.set(base, count + 1)
    item.baseName = count === 0 ? base : `${base} [${item.bvid}]`
  }
}

async function runWorkerPool(job, cookie, signal) {
  let cursor = 0
  const worker = async () => {
    for (;;) {
      if (job.canceled || signal.aborted) return
      const index = cursor
      cursor += 1
      if (index >= job.items.length) return
      const item = job.items[index]
      await runVideo(job, item, cookie, signal, index)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, job.concurrency) }, worker))
}

function finishJob(job) {
  if (job.canceled) {
    job.state = 'canceled'
    job.message = `已停止：完成 ${job.done} 个，失败 ${job.failed} 个，跳过 ${job.skipped} 个`
    for (const item of job.items) if (item.state === 'pending') item.state = 'canceled'
  } else {
    job.state = job.failed > 0 && job.done === 0 && job.skipped === 0 ? 'failed' : 'done'
    job.message = job.state === 'failed'
      ? `全部失败：共 ${job.failed} 个`
      : job.failed > 0
        ? `完成 ${job.done} 个，失败 ${job.failed} 个，跳过 ${job.skipped} 个`
        : `全部完成：共 ${job.done} 个，跳过 ${job.skipped} 个`
  }
  job.current = null
  job.currentFile = ''
  job.currentBytes = 0
  job.currentTotal = 0
  job.finishedAt = Date.now()
}

async function runJob(job, cookie, signal) {
  const listing = await listUserVideos(job.uid, {
    cookie,
    max: job.limit > 0 ? job.limit : 5000,
    onPage: progress => {
      job.message = `正在获取视频列表（第 ${progress.page} 页，已获取 ${progress.collected} 个）…`
    },
  })
  if (listing.videos.length === 0) {
    job.state = 'failed'
    job.message = '这个 UP 主的主页下没有可下载的视频（或全部为隐藏合集）。'
    job.finishedAt = Date.now()
    return
  }
  job.total = listing.videos.length
  job.items = listing.videos.map(video => ({
    bvid: video.bvid,
    title: video.title,
    state: 'pending',
    files: 0,
    qualityId: '',
    qualityLabel: '',
    error: '',
  }))
  assignUniqueNames(job.items)
  job.state = 'running'
  job.message = `准备下载 ${job.total} 个视频`
  await mkdir(job.folder, { recursive: true })

  await runWorkerPool(job, cookie, signal)
  finishJob(job)
}

async function runVideo(job, item, cookie, signal, index) {
  item.state = 'running'
  job.current = { index: index + 1, title: item.title, bvid: item.bvid }
  let pages
  try {
    pages = await listVideoPages(item.bvid, cookie)
  } catch (error) {
    item.state = 'failed'
    item.error = error instanceof Error ? error.message : '无法获取视频分 P'
    job.failed += 1
    return
  }
  if (pages.length === 0) {
    item.state = 'failed'
    item.error = '没有可下载的分 P'
    job.failed += 1
    return
  }
  const selected = job.includeParts ? pages : pages.slice(0, 1)
  let downloaded = 0
  let skipped = 0
  let qualityId = ''
  let qualityLabel = ''

  for (const page of selected) {
    if (job.canceled || signal.aborted) {
      item.state = 'canceled'
      return
    }
    const suffix = pages.length > 1 ? ` - P${page.page}${page.part ? ` ${sanitizeName(page.part, '')}` : ''}` : ''
    const baseName = (item.baseName || sanitizeName(item.title, item.bvid)) + suffix
    const target = join(job.folder, `${baseName}.mp4`)
    if (!job.overwrite && await fileSize(target) > 0) {
      skipped += 1
      continue
    }
    job.currentFile = `${baseName}.mp4`
    job.currentBytes = 0
    job.currentTotal = 0
    try {
      const play = await resolvePlay(item.bvid, page.cid, job.quality.qn, job.mode, cookie)
      if (!play) throw new BiliError('这个视频没有可用的下载地址（可能是充电专属或已下架）。')
      const achieved = QUALITY_BY_QN.get(play.quality) ?? QUALITY_BY_ID.get('1080p')
      qualityId = achieved.id
      qualityLabel = achieved.label
      job.achievedQn = Math.max(job.achievedQn || 0, achieved.qn)
      if (play.kind === 'dash') {
        const videoTemp = `${target}.video.m4s`
        const audioTemp = `${target}.audio.m4s`
        await downloadTo(videoTemp, play.video.urls, {
          signal,
          onProgress: (bytes, total) => {
            job.currentBytes = bytes
            job.currentTotal = total || play.size
          },
        })
        await downloadTo(audioTemp, play.audio.urls, { signal })
        job.message = '正在合并音视频…'
        await mergeWithFfmpeg(job.ffmpegPath, videoTemp, audioTemp, target)
        await rm(videoTemp, { force: true })
        await rm(audioTemp, { force: true })
        job.message = `正在下载（已完成 ${job.done + 1}/${job.total}）`
      } else {
        if (play.segments && play.segments.length > 1) {
          await downloadSegments(target, play.segments, {
            signal,
            onProgress: (bytes, total) => {
              job.currentBytes = bytes
              job.currentTotal = total || play.size
            },
          })
        } else {
          await downloadTo(target, play.urls, {
            signal,
            onProgress: (bytes, total) => {
              job.currentBytes = bytes
              job.currentTotal = total || play.size
            },
          })
        }
      }
      const size = await fileSize(target)
      job.totalBytes += size
      downloaded += 1
    } catch (error) {
      if (job.canceled || signal.aborted || (error instanceof Error && error.message === 'canceled')) {
        item.state = 'canceled'
        return
      }
      item.state = 'failed'
      item.error = error instanceof Error ? error.message : '下载失败'
      job.failed += 1
      return
    }
  }

  item.files = downloaded
  item.qualityId = qualityId
  item.qualityLabel = qualityLabel
  if (downloaded === 0 && skipped > 0) {
    item.state = 'skipped'
    job.skipped += 1
  } else {
    item.state = 'done'
    job.done += 1
  }
  job.current = null
  job.currentFile = ''
}

function cancelJob(job) {
  job.canceled = true
  try { job.controller?.abort() } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* HTTP route                                                          */
/* ------------------------------------------------------------------ */

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) {
      req.resume()
      return null
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, size).toString('utf8')
}

function recentJobs(limit = 6) {
  return [...jobs.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit)
    .reverse()
    .map(job => snapshot(job, { items: false }))
}

async function loginState(ctx, config, cookie) {
  if (!cookie) return { loggedIn: false }
  try {
    const data = await navInfo(cookie, 12_000)
    return {
      loggedIn: Boolean(data?.isLogin),
      uname: typeof data?.uname === 'string' ? data.uname : '',
      vip: Boolean(data?.vipStatus),
    }
  } catch {
    return { loggedIn: false, unknown: true }
  }
}

async function handle(ctx, config, body) {
  const action = typeof body?.action === 'string' ? body.action : ''
  const settings = await readSettings()
  const cookie = await readLoginCookie(ctx, config)

  if (action === 'status') {
    const ffmpeg = await detectFfmpeg(settings.ffmpegPath || config?.ffmpegPath)
    const login = await loginState(ctx, config, cookie)
    const active = [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt)[0]
    return {
      ...login,
      cookieConfigured: Boolean(cookie),
      cookieSource: cookie ? (await readCookieFromStore(ctx) ? 'store' : 'fallback') : '',
      ffmpeg,
      settings,
      qualities: QUALITIES.map(item => ({ id: item.id, label: item.label, hint: item.hint })),
      jobs: recentJobs(),
      activeJob: active ? snapshot(active) : null,
    }
  }

  if (action === 'installFfmpeg') {
    const installed = await installFfmpeg()
    ffmpegCache = { value: installed, ts: Date.now() }
    return { ffmpeg: installed }
  }

  if (action === 'saveSettings') {
    const next = await writeSettings({
      quality: body.quality,
      mode: body.mode,
      outputDir: body.outputDir,
      concurrency: body.concurrency,
      includeParts: body.includeParts,
      ffmpegPath: body.ffmpegPath,
    })
    ffmpegCache = { value: undefined, ts: 0 }
    return { settings: next, ffmpeg: await detectFfmpeg(next.ffmpegPath) }
  }

  if (action === 'saveCookie') {
    const raw = normalizeCookieInput(typeof body.cookie === 'string' ? body.cookie : '')
    if (!raw) throw new BiliError('Cookie 不能为空。')
    if (!/sessdata=/i.test(raw)) throw new BiliError('Cookie 里缺少 SESSDATA，请复制浏览器中 www.bilibili.com 的 SESSDATA 值或完整 Cookie。')
    const result = await saveLoginCookie(ctx, raw)
    const login = await loginState(ctx, config, raw)
    return {
      saved: result.saved,
      source: result.source,
      ...login,
      warning: login.loggedIn ? '' : 'Cookie 已保存，但 B 站没有确认登录状态，可能已过期或复制不完整。',
    }
  }

  if (action === 'clearCookie') {
    await saveLoginCookie(ctx, '')
    return { cleared: true }
  }

  if (action === 'user') {
    const uid = String(body.uid ?? '').trim()
    if (!/^\d{1,20}$/.test(uid)) throw new BiliError('请输入正确的 UP 主 UID（纯数字）。')
    if (!cookie) throw new BiliError('获取 UP 主信息需要登录 Cookie，请先在上方填入 SESSDATA。')
    const user = await resolveUser(uid, cookie)
    return { user }
  }

  if (action === 'videos') {
    const uid = String(body.uid ?? '').trim()
    if (!/^\d{1,20}$/.test(uid)) throw new BiliError('请输入正确的 UP 主 UID（纯数字）。')
    if (!cookie) throw new BiliError('获取视频列表需要登录 Cookie，请先在上方填入 SESSDATA。')
    const limit = Math.min(60, Math.max(1, Number(body.limit) || 30))
    const listing = await listUserVideos(uid, { cookie, max: limit })
    const availableQualities = listing.videos.length > 0
      ? await probeVideoQualities(listing.videos[0].bvid, cookie)
      : []
    return { total: listing.total, count: listing.videos.length, videos: listing.videos, availableQualities }
  }

  if (action === 'start') {
    const job = await startJob({
      uid: body.uid,
      quality: body.quality ?? settings.quality,
      mode: body.mode ?? settings.mode,
      outputDir: body.outputDir ?? settings.outputDir,
      includeParts: body.includeParts === undefined ? settings.includeParts : body.includeParts !== false,
      overwrite: body.overwrite === true,
      limit: body.limit,
      concurrency: body.concurrency ?? settings.concurrency,
      cookie,
      config,
    })
    return { job: snapshot(job, { items: false }) }
  }

  if (action === 'startUrl') {
    const job = await startDirectJob({
      url: body.url,
      quality: body.quality ?? settings.quality,
      mode: body.mode ?? settings.mode,
      outputDir: body.outputDir ?? settings.outputDir,
      overwrite: body.overwrite === true,
      cookie,
      config,
    })
    return { job: snapshot(job, { items: false }) }
  }

  if (action === 'job') {
    const job = jobs.get(String(body.id ?? ''))
    if (!job) throw new BiliError('找不到这个下载任务。')
    return { job: snapshot(job) }
  }

  if (action === 'cancel') {
    const job = jobs.get(String(body.id ?? ''))
    if (!job) throw new BiliError('找不到这个下载任务。')
    cancelJob(job)
    return { job: snapshot(job, { items: false }) }
  }

  if (action === 'openFolder') {
    const target = normalizeOutputDir(body.path ?? settings.outputDir)
    await mkdir(target, { recursive: true })
    const result = await openFolder(target)
    if (!result.opened) throw new BiliError(`无法打开文件夹：${result.error || '系统没有响应'}`)
    return { path: target, opened: true, via: result.via }
  }

  throw new BiliError('未知的操作。')
}

function spawnDetached(command, args) {
  return new Promise(resolve => {
    let child
    try {
      child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true })
    } catch (error) {
      resolve({ ok: false, error: error instanceof Error ? error.message : '无法启动系统文件管理器' })
      return
    }
    let settled = false
    const finish = outcome => {
      if (settled) return
      settled = true
      resolve(outcome)
    }
    child.once('error', error => finish({ ok: false, error: error.message }))
    child.once('spawn', () => {
      child.unref()
      finish({ ok: true })
    })
    setTimeout(() => finish({ ok: true }), 4000)
  })
}

/** Electron's own shell integration is the most reliable opener inside DSH Desktop. */
async function openViaElectron(target) {
  try {
    const electron = await import('electron')
    const shell = electron?.shell ?? electron?.default?.shell
    if (!shell || typeof shell.openPath !== 'function') return undefined
    const failure = await shell.openPath(target)
    if (!failure) return { opened: true, via: 'electron' }
    return { opened: false, via: 'electron', error: String(failure) }
  } catch {
    return undefined
  }
}

/** Newest direct child file, used to open Explorer with that file selected. */
async function newestChildFile(folder) {
  try {
    const names = await readdir(folder)
    let best = ''
    let bestTime = 0
    for (const name of names) {
      const full = join(folder, name)
      try {
        const info = await stat(full)
        if (info.isFile() && info.mtimeMs > bestTime) {
          best = full
          bestTime = info.mtimeMs
        }
      } catch {
        // Skip entries that disappear mid-scan.
      }
    }
    return best
  } catch {
    return ''
  }
}

/** Open a folder (or reveal its newest file) and report what actually happened. */
async function openFolder(target) {
  const viaElectron = await openViaElectron(target)
  if (viaElectron?.opened) return viaElectron
  if (process.platform === 'win32') {
    const newest = await newestChildFile(target)
    if (newest) {
      /* A fresh Explorer window that also highlights the newest file: more
         visible than reusing a window that may sit behind the app. */
      const reveal = await spawnDetached('explorer.exe', [`/select,${newest}`])
      if (reveal.ok) return { opened: true, via: 'explorer-select' }
    }
    const viaCmd = await spawnDetached('cmd.exe', ['/c', 'start', '', target])
    if (viaCmd.ok) return { opened: true, via: 'cmd' }
    const explorer = join(process.env.SystemRoot || 'C:\\Windows', 'explorer.exe')
    const direct = await spawnDetached(existsSync(explorer) ? explorer : 'explorer.exe', [target])
    return direct.ok
      ? { opened: true, via: 'explorer' }
      : { opened: false, error: direct.error || viaCmd.error || viaElectron?.error }
  }
  if (process.platform === 'darwin') {
    const result = await spawnDetached('open', [target])
    return result.ok ? { opened: true, via: 'open' } : { opened: false, error: result.error || viaElectron?.error }
  }
  const result = await spawnDetached('xdg-open', [target])
  return result.ok ? { opened: true, via: 'xdg-open' } : { opened: false, error: result.error || viaElectron?.error }
}

/* ------------------------------------------------------------------ */
/* Agent tools                                                         */
/* ------------------------------------------------------------------ */

function textBlock(text) {
  return [{ type: 'text', text }]
}

function createTools(ctx, config) {
  const downloadTool = {
    name: 'bilibili_download_videos',
    description: 'Download every video from a Bilibili uploader, identified by UID, into a local folder. The transfer runs in the background and returns a job id; poll it with bilibili_download_status. Quality and destination default to the values saved in the Bilibili downloader panel. Listing an uploader requires the plugin to hold a Bilibili login cookie, and higher qualities depend on that account. Existing files are skipped unless overwrite is set.',
    parameters: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'Numeric UID of the uploader, for example "546195".' },
        quality: {
          type: 'string',
          enum: QUALITIES.map(item => item.id),
          description: 'Requested quality id. Defaults to the panel setting.',
        },
        outputDir: { type: 'string', description: 'Absolute destination folder. Defaults to the panel setting; each uploader gets a subfolder named after them.' },
        limit: { type: 'integer', minimum: 1, description: 'Download at most this many of the newest videos. Omit for all videos.' },
        includeParts: { type: 'boolean', description: 'Download every part of a multi-part video. Defaults to the panel setting (usually true).' },
        overwrite: { type: 'boolean', description: 'Re-download and replace files that already exist in the destination folder, for example to upgrade previously downloaded lower-quality copies.' },
        mode: {
          type: 'string',
          enum: ['auto', 'dash', 'file'],
          description: 'Transfer channel: "auto" merges DASH when ffmpeg is available and otherwise uses the single-file MP4 channel; "file" always uses the single-file channel.',
        },
        dryRun: { type: 'boolean', description: 'Only list the uploader and their video count; start no download.' },
      },
      required: ['uid'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } } },
      render(args, value) {
        return textBlock(String(value?.text ?? ''))
      },
    },
    timeoutMs: 180_000,
    async execute(args) {
      const input = args && typeof args === 'object' ? args : {}
      const settings = await readSettings()
      const cookie = await readLoginCookie(ctx, config)
      if (!cookie) {
        return {
          text: 'B 站下载插件还没有登录 Cookie。请打开左侧栏「B 站下载」面板，填入浏览器里的 SESSDATA 后再试。',
          needsLogin: true,
        }
      }
      const uid = String(input.uid ?? '').trim()
      if (!/^\d{1,20}$/.test(uid)) throw new Error('请输入纯数字的 UP 主 UID。')
      const user = await resolveUser(uid, cookie)
      if (input.dryRun) {
        const listing = await listUserVideos(uid, { cookie, max: 10 })
        const titles = listing.videos.slice(0, 5).map(video => `· ${video.title}`).join('\n')
        return {
          text: `UP 主：${user.name}（UID ${user.uid}），主页共 ${listing.total} 个视频。\n${titles}${listing.total > 5 ? '\n…' : ''}`,
          uid: user.uid,
          name: user.name,
          total: listing.total,
        }
      }
      const job = await startJob({
        uid,
        quality: input.quality ?? settings.quality,
        mode: input.mode ?? settings.mode,
        outputDir: input.outputDir ?? settings.outputDir,
        includeParts: input.includeParts === undefined ? settings.includeParts : input.includeParts !== false,
        overwrite: input.overwrite === true,
        limit: input.limit,
        concurrency: settings.concurrency,
        cookie,
        config,
      })
      return {
        text: `已开始下载「${user.name}」的视频：任务 ${job.id}，清晰度 ${job.quality.label}，通道 ${job.mode === 'dash' ? 'DASH（ffmpeg 合并）' : '单文件 MP4'}，保存到 ${job.folder}。用 bilibili_download_status 查看进度。`,
        jobId: job.id,
        uid: user.uid,
        name: user.name,
        quality: job.quality.id,
        mode: job.mode,
        outputDir: job.folder,
      }
    },
  }

  const statusTool = {
    name: 'bilibili_download_status',
    description: 'Report progress of a Bilibili downloader job, or of the most recent job when no id is given.',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Job id returned by bilibili_download_videos. Omit for the most recent job.' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } } },
      render(args, value) {
        return textBlock(String(value?.text ?? ''))
      },
    },
    async execute(args) {
      const input = args && typeof args === 'object' ? args : {}
      const job = input.jobId
        ? jobs.get(String(input.jobId))
        : [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt)[0]
      if (!job) return { text: '还没有下载任务。' }
      const view = snapshot(job)
      const lines = [
        `任务 ${view.id} · ${view.uname}（UID ${view.uid}）`,
        `状态：${stateLabel(view.state)}；完成 ${view.done}，失败 ${view.failed}，跳过 ${view.skipped}，共 ${view.total}`,
        view.current ? `正在下载：${view.current.title}` : '',
        view.message,
        `保存目录：${view.folder}`,
      ].filter(Boolean)
      return { text: lines.join('\n'), job: view }
    },
  }

  const singleTool = {
    name: 'bilibili_download_video',
    description: 'Download one Bilibili video by link, BV id, or av id into the local destination folder, reusing the panel settings. Returns a job id; poll it with bilibili_download_status. This path does not list an uploader, so it works without a login cookie, although quality still depends on the cookie the plugin holds.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Video URL, b23.tv short link, BV id, or av id.' },
        quality: {
          type: 'string',
          enum: QUALITIES.map(item => item.id),
          description: 'Requested quality id. Defaults to the panel setting.',
        },
        outputDir: { type: 'string', description: 'Absolute destination folder. Defaults to the panel setting; the video is saved under a subfolder named after its uploader.' },
        overwrite: { type: 'boolean', description: 'Replace an existing file with the same name instead of keeping it.' },
        mode: {
          type: 'string',
          enum: ['auto', 'dash', 'file'],
          description: 'Transfer channel: "auto" merges DASH when ffmpeg is available and otherwise uses the single-file MP4 channel.',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } } },
      render(args, value) {
        return textBlock(String(value?.text ?? ''))
      },
    },
    timeoutMs: 120_000,
    async execute(args) {
      const input = args && typeof args === 'object' ? args : {}
      const settings = await readSettings()
      const cookie = await readLoginCookie(ctx, config)
      const job = await startDirectJob({
        url: input.url,
        quality: input.quality ?? settings.quality,
        mode: input.mode ?? settings.mode,
        outputDir: input.outputDir ?? settings.outputDir,
        overwrite: input.overwrite === true,
        cookie,
        config,
      })
      const item = job.items[0]
      return {
        text: `已开始下载「${item.title}」：任务 ${job.id}，清晰度 ${job.quality.label}，通道 ${job.mode === 'dash' ? 'DASH（ffmpeg 合并）' : '单文件 MP4'}，保存到 ${job.folder}。用 bilibili_download_status 查看进度。`,
        jobId: job.id,
        title: item.title,
        quality: job.quality.id,
        mode: job.mode,
        outputDir: job.folder,
      }
    },
  }

  const openTool = {
    name: 'bilibili_open_download_folder',
    description: 'Open the Bilibili downloader destination folder, or a given folder, in the system file manager.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute folder to open. Defaults to the saved download destination.' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } } },
      render(args, value) {
        return textBlock(String(value?.text ?? ''))
      },
    },
    async execute(args) {
      const input = args && typeof args === 'object' ? args : {}
      const settings = await readSettings()
      const target = normalizeOutputDir(input.path ?? settings.outputDir)
      await mkdir(target, { recursive: true })
      const result = await openFolder(target)
      if (!result.opened) throw new Error(`无法打开文件夹：${result.error || '系统没有响应'}`)
      return { text: `已在文件管理器中打开：${target}（方式：${result.via}）`, path: target, via: result.via }
    },
  }

  return [downloadTool, singleTool, statusTool, openTool]
}

function stateLabel(state) {
  const map = {
    listing: '获取列表中',
    running: '下载中',
    done: '已完成',
    canceled: '已停止',
    failed: '失败',
  }
  return map[state] ?? state
}

/* ------------------------------------------------------------------ */
/* Plugin                                                              */
/* ------------------------------------------------------------------ */

/** The trust fence consumed here; the browser-side connection package owns the contract. */
export const inject = ['webServer', 'tools', 'connection']

export function apply(ctx, config) {
  const fence = () => {
    const gate = Reflect.get(ctx, 'connection')
    return gate && typeof gate.requestRejection === 'function' ? gate : undefined
  }

  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'prefix',
      path: API_PATH,
      handler: async (req, res) => {
        const gate = fence()
        if (gate) {
          const rejection = gate.requestRejection(req)
          if (rejection !== undefined) {
            res.statusCode = rejection
            res.end()
            return
          }
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('allow', 'POST')
          res.end()
          return
        }
        const essence = String(req.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase()
        if (essence !== 'application/json') {
          sendJson(res, 415, { ok: false, error: 'content-type 必须是 application/json' })
          return
        }
        const text = await readBody(req)
        if (text === null) {
          sendJson(res, 413, { ok: false, error: '请求内容过大' })
          return
        }
        let body
        try {
          body = JSON.parse(text)
        } catch {
          sendJson(res, 400, { ok: false, error: '请求格式错误' })
          return
        }
        try {
          const data = await handle(ctx, config, body)
          sendJson(res, 200, { ok: true, data })
        } catch (error) {
          sendJson(res, 200, {
            ok: false,
            error: error instanceof Error ? error.message : '操作失败',
            code: error && typeof error.code === 'number' ? error.code : undefined,
          })
        }
      },
    })
    return () => dispose()
  }, 'bilibili-downloader: /bilibili-downloader/api route')

  ctx.effect(() => {
    const disposers = createTools(ctx, config).map(tool => ctx.tools.register(tool))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'bilibili-downloader: agent tools')
}
