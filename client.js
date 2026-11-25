window.__ModuleLoader__.load({
  id: 'dsh-bilibili-downloader',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const NS = 'bilibili-downloader';
    const PANEL_ID = 'bilibili-downloader';
    const API = '/bilibili-downloader/api';
    const STORAGE_UID = 'dsh.bilibili-downloader.uid';

    /* ------------------------------------------------------------------ */
    /* Dictionaries                                                        */
    /* ------------------------------------------------------------------ */

    const ZH = {
      panel: 'B 站下载',
      title: 'B 站 UP 主视频下载',
      subtitle: '输入 UID，选择清晰度与保存目录，批量下载主页下的全部视频。',
      loginOn: '已登录 {name}',
      loginVip: '大会员',
      loginOff: '未登录',
      loginUnknown: '登录状态未知',
      checking: '检测中…',
      dismiss: '关闭',
      ffmpegOn: 'ffmpeg 就绪',
      ffmpegOff: '无 ffmpeg',
      settings: '下载设置',
      quality: '清晰度',
      q8k: '8K 超高清',
      q4k: '4K 超清',
      q1080p60: '1080P 60 帧',
      q1080p: '1080P 高清',
      q720p: '720P 准高清',
      q480p: '480P 清晰',
      q360p: '360P 流畅',
      mode: '下载通道',
      modeAuto: '自动（有 ffmpeg 时用 DASH）',
      modeFile: '单文件 MP4（无需 ffmpeg）',
      modeDash: 'DASH 合并（需要 ffmpeg）',
      outputDir: '保存目录',
      browse: '浏览…',
      concurrency: '同时下载',
      includeParts: '下载多 P 视频的全部分 P',
      ffmpegPath: 'ffmpeg 路径（可选）',
      ffmpegPlaceholder: '留空则自动查找',
      installFfmpeg: '一键下载 ffmpeg',
      installingFfmpeg: '正在下载 ffmpeg…',
      ffmpegInstalled: 'ffmpeg 已下载并启用',
      cookieTitle: '登录 Cookie',
      cookiePlaceholder: '粘贴 SESSDATA 或整段 Cookie',
      cookieSave: '保存',
      cookieClear: '清除',
      cookieSaved: 'Cookie 已保存',
      cookieCleared: 'Cookie 已清除',
      cookieEmpty: '请先粘贴 Cookie 或 SESSDATA。',
      cookieHint: '在浏览器登录 bilibili.com，按 F12 → 应用（Application）→ Cookie，复制 SESSDATA 的值粘贴到这里。B 站要求登录后才返回 UP 主的视频列表。',
      cookieNeeded: '还没有登录 Cookie。B 站不再允许游客读取 UP 主主页视频列表，请先填写 SESSDATA。',
      ffmpegHintOff: '未检测到 ffmpeg：将使用 B 站单文件 MP4 通道，通常最高 1080P。要下载 4K/8K 等 DASH 画质，请安装 ffmpeg 并在上方填写路径。',
      ffmpegHintOn: '已找到 ffmpeg：{path}。自动模式会用 DASH 下载并在本地合并音视频。',
      downloadTitle: '下载 UP 主视频',
      modeByUid: '按 UP 主',
      modeByLink: '按链接',
      linkLabel: '视频链接或 BV 号',
      linkUsesSettings: '将使用上面的设置：{quality} · {mode} · {dir}',
      singlePlaceholder: '粘贴视频链接、b23.tv 短链、BV 号或 av 号',
      singleStart: '下载这个视频',
      singleEmpty: '请先粘贴视频链接或 BV 号。',
      uid: 'UP 主 UID',
      uidPlaceholder: '例如 546195',
      lookup: '查询',
      lookupLoading: '查询中…',
      videosCount: '主页共 {n} 个视频',
      limit: '最多下载',
      limitPlaceholder: '留空 = 全部',
      start: '开始下载',
      starting: '创建任务中…',
      overwrite: '覆盖已存在的文件（重新下载）',
      stop: '停止',
      openFolder: '打开文件夹',
      queue: '下载队列',
      queueMore: '仅显示最近 {n} 条记录。',
      progressLine: '完成 {done} / {total}',
      progress: '下载进度',
      failedLine: '失败 {failed}',
      skippedLine: '跳过 {skipped}',
      currentFile: '正在下载：{name}',
      currentBytes: '{done} / {total}',
      stateListing: '获取列表中',
      stateRunning: '下载中',
      stateDone: '已完成',
      stateCanceled: '已停止',
      stateFailed: '失败',
      statePending: '等待',
      stateSkipped: '已存在',
      errorTitle: '出错了',
      retry: '重试',
      loading: '加载中…',
      uidInvalid: '请输入纯数字的 UP 主 UID。',
      browseUnavailable: '这个环境不支持选择文件夹，请直接填写路径。',
      browseFailed: '打开文件夹选择器失败。',
      qualityNeedsDash: '这个清晰度需要 DASH 通道：请安装 ffmpeg 并填写路径，或把通道改为「自动」。',
      fileCapHint: '单文件 MP4 通道在很多视频上最高只给到 720P；要稳定拿到 1080P 及以上，请安装 ffmpeg 并把通道设为「自动」或「DASH」。',
      qualityCapped: '请求 {requested}，B 站这次实际最高返回 {actual}。单文件通道通常只到 720P，1080P 及以上需要 ffmpeg 走 DASH。',
      availableQualities: '最新视频可用清晰度：{list}',
      pickedTooHigh: '所选清晰度高于该视频的最高可用（{actual}），下载时会自动使用实际可用的最高清晰度。',
      folderOpened: '已打开文件夹：{path}（若窗口没到最前面，请用 Alt+Tab 或任务栏切换）',
      jobBusy: '已有任务在运行，请先停止或等待完成。',
      jobBusyHint: '任务运行中，结束后才能开始新的下载。',
      jobStarted: '已开始下载',
      stopped: '已停止下载',
      startHint: '先保存登录 Cookie 才能开始下载。',
      needCookie: '请先填写并保存登录 Cookie。',
      needFfmpeg: 'DASH 通道需要 ffmpeg，请改用「自动」或「单文件 MP4」。',
      detailSummary: '通道：{mode}',
      requestedQuality: '请求清晰度 {quality}',
      detailFiles: '{n} 个文件',
    };

    const EN = {
      panel: 'Bilibili',
      title: 'Bilibili uploader downloader',
      subtitle: 'Enter a UID, pick a quality and a destination, then download every video on that uploader page.',
      loginOn: 'Signed in as {name}',
      loginVip: 'Premium',
      loginOff: 'Signed out',
      loginUnknown: 'Sign-in state unknown',
      checking: 'Checking…',
      dismiss: 'Dismiss',
      ffmpegOn: 'ffmpeg ready',
      ffmpegOff: 'no ffmpeg',
      settings: 'Download settings',
      quality: 'Quality',
      q8k: '8K',
      q4k: '4K',
      q1080p60: '1080P 60fps',
      q1080p: '1080P',
      q720p: '720P',
      q480p: '480P',
      q360p: '360P',
      mode: 'Channel',
      modeAuto: 'Auto (DASH when ffmpeg is available)',
      modeFile: 'Single-file MP4 (no ffmpeg)',
      modeDash: 'DASH merge (needs ffmpeg)',
      outputDir: 'Destination',
      browse: 'Browse…',
      concurrency: 'Parallel downloads',
      includeParts: 'Download every part of multi-part videos',
      ffmpegPath: 'ffmpeg path (optional)',
      ffmpegPlaceholder: 'Empty means auto-detect',
      installFfmpeg: 'Download ffmpeg',
      installingFfmpeg: 'Downloading ffmpeg…',
      ffmpegInstalled: 'ffmpeg downloaded and enabled',
      cookieTitle: 'Sign-in cookie',
      cookiePlaceholder: 'Paste SESSDATA or the full cookie',
      cookieSave: 'Save',
      cookieClear: 'Clear',
      cookieSaved: 'Cookie saved',
      cookieCleared: 'Cookie cleared',
      cookieEmpty: 'Paste a cookie or SESSDATA first.',
      cookieHint: 'Sign in at bilibili.com, open F12 → Application → Cookies, then copy the SESSDATA value here. Bilibili only returns an uploader video list to a signed-in request.',
      cookieNeeded: 'No sign-in cookie yet. Bilibili no longer returns uploader video lists to anonymous requests, so add SESSDATA first.',
      ffmpegHintOff: 'ffmpeg was not found: downloads use Bilibili single-file MP4, usually up to 1080P. Install ffmpeg and set its path to download DASH qualities such as 4K and 8K.',
      ffmpegHintOn: 'ffmpeg found: {path}. Auto mode downloads DASH and merges audio and video locally.',
      downloadTitle: 'Download uploader videos',
      modeByUid: 'By uploader',
      modeByLink: 'By link',
      linkLabel: 'Video link or BV id',
      linkUsesSettings: 'Uses the settings above: {quality} · {mode} · {dir}',
      singlePlaceholder: 'Paste a video link, b23.tv short link, BV id, or av id',
      singleStart: 'Download this video',
      singleEmpty: 'Paste a video link or BV id first.',
      uid: 'Uploader UID',
      uidPlaceholder: 'For example 546195',
      lookup: 'Check',
      lookupLoading: 'Checking…',
      videosCount: '{n} videos on the uploader page',
      limit: 'Download at most',
      limitPlaceholder: 'Empty means all',
      start: 'Start download',
      starting: 'Creating job…',
      overwrite: 'Replace existing files (re-download)',
      stop: 'Stop',
      openFolder: 'Open folder',
      queue: 'Download queue',
      queueMore: 'Showing the most recent {n} entries.',
      progressLine: 'Done {done} / {total}',
      progress: 'Download progress',
      failedLine: 'Failed {failed}',
      skippedLine: 'Skipped {skipped}',
      currentFile: 'Downloading: {name}',
      currentBytes: '{done} / {total}',
      stateListing: 'Listing',
      stateRunning: 'Downloading',
      stateDone: 'Done',
      stateCanceled: 'Stopped',
      stateFailed: 'Failed',
      statePending: 'Queued',
      stateSkipped: 'Already there',
      errorTitle: 'Something went wrong',
      retry: 'Retry',
      loading: 'Loading…',
      uidInvalid: 'Enter the numeric uploader UID.',
      browseUnavailable: 'Folder picking is unavailable here; type the path instead.',
      browseFailed: 'The folder picker failed.',
      qualityNeedsDash: 'This quality needs the DASH channel. Install ffmpeg and set its path, or switch the channel to Auto.',
      fileCapHint: 'The single-file MP4 channel often stops at 720P. To get 1080P and above reliably, install ffmpeg and use Auto or DASH.',
      qualityCapped: 'Requested {requested}, but Bilibili returned at most {actual}. The single-file channel usually caps at 720P; 1080P and above need ffmpeg with DASH.',
      availableQualities: 'Qualities of the newest video: {list}',
      pickedTooHigh: 'The selection is above this video’s maximum ({actual}); the download will use the highest quality actually offered.',
      folderOpened: 'Opened folder: {path} (if it stays behind this app, use Alt+Tab or the taskbar)',
      jobBusy: 'A job is already running; stop it or wait for it to finish.',
      jobBusyHint: 'A job is running; a new download can start after it ends.',
      jobStarted: 'Download started',
      stopped: 'Download stopped',
      startHint: 'Save a sign-in cookie before starting.',
      needCookie: 'Add and save a sign-in cookie first.',
      needFfmpeg: 'The DASH channel needs ffmpeg. Choose Auto or Single-file MP4 instead.',
      detailSummary: 'Channel: {mode}',
      requestedQuality: 'Requested {quality}',
      detailFiles: '{n} files',
    };

    /** Wrap the locale binder with `{name}` interpolation; dictionaries stay plain text. */
    function localized(bind) {
      return (key, vars) => {
        let text = bind(key);
        if (vars) {
          for (const name of Object.keys(vars)) {
            text = text.split('{' + name + '}').join(String(vars[name]));
          }
        }
        return text;
      };
    }

    function safeT(maybeT) {
      if (typeof maybeT === 'function') return maybeT;
      return (key, vars) => {
        let text = ZH[key] || key;
        if (vars) for (const name of Object.keys(vars)) text = text.split('{' + name + '}').join(String(vars[name]));
        return text;
      };
    }

    /* ------------------------------------------------------------------ */
    /* Formatting                                                          */
    /* ------------------------------------------------------------------ */

    function formatBytes(bytes) {
      const value = Number(bytes) || 0;
      if (value < 1024) return value + ' B';
      const units = ['KB', 'MB', 'GB', 'TB'];
      let size = value / 1024;
      let unit = 0;
      while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit += 1;
      }
      return (size >= 100 ? size.toFixed(0) : size.toFixed(1)) + ' ' + units[unit];
    }

    function formatCount(count) {
      const value = Number(count) || 0;
      if (value >= 10000) return (value / 10000).toFixed(value >= 100000 ? 0 : 1) + ' 万';
      return String(value);
    }

    function stateText(t, state) {
      const map = {
        listing: 'stateListing',
        running: 'stateRunning',
        done: 'stateDone',
        canceled: 'stateCanceled',
        failed: 'stateFailed',
        pending: 'statePending',
        skipped: 'stateSkipped',
      };
      return t(map[state] || 'statePending');
    }

    function modeText(t, mode) {
      if (mode === 'dash') return t('modeDash');
      if (mode === 'file') return t('modeFile');
      return t('modeAuto');
    }

    /** Localized quality names; the host list supplies the canonical ids. */
    const QUALITY_ORDER = ['8k', '4k', '1080p60', '1080p', '720p', '480p', '360p'];
    function qualityRank(id) {
      const index = QUALITY_ORDER.indexOf(id);
      return index < 0 ? QUALITY_ORDER.length : index;
    }
    function qualityLabel(t, id, fallback) {
      const map = {
        '8k': 'q8k',
        '4k': 'q4k',
        '1080p60': 'q1080p60',
        '1080p': 'q1080p',
        '720p': 'q720p',
        '480p': 'q480p',
        '360p': 'q360p',
      };
      const key = map[id];
      return key ? t(key) : (fallback || id);
    }

    /* ------------------------------------------------------------------ */
    /* API                                                                 */
    /* ------------------------------------------------------------------ */

    async function call(action, payload, timeoutMs = 150000) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(API, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(Object.assign({ action }, payload || {})),
          signal: controller.signal,
        });
        let body = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        if (!response.ok) throw new Error((body && body.error) || 'HTTP ' + response.status);
        if (!body || body.ok !== true) throw new Error((body && body.error) || '请求失败');
        return body.data;
      } catch (error) {
        if (error && error.name === 'AbortError') throw new Error('请求超时，请稍后重试');
        throw error;
      } finally {
        window.clearTimeout(timer);
      }
    }

    /* ------------------------------------------------------------------ */
    /* Glyphs                                                              */
    /* ------------------------------------------------------------------ */

    function BiliIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 18;
      const active = Boolean(props.active);
      const stroke = active ? 2.4 : 2;
      return h('svg', {
        width: size, height: size, viewBox: '0 0 36 36', fill: 'none',
        'aria-hidden': 'true', focusable: 'false', style: { display: 'block' },
      },
      h('rect', { x: 4.5, y: 9.5, width: 27, height: 21, rx: 5, stroke: 'currentColor', strokeWidth: stroke }),
      h('path', { d: 'm10.8 5.2 3.4 3.9M25.2 5.2l-3.4 3.9', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round' }),
      h('path', { d: 'M15.1 15.4v9.2l8-4.6-8-4.6Z', fill: 'currentColor' }));
    }

    function DownloadGlyph() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('path', { d: 'M8 2.4v7.2', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
        h('path', { d: 'm4.9 6.7 3.1 3.1 3.1-3.1', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('path', { d: 'M3 12.4h10', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }));
    }

    function FolderGlyph() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('path', { d: 'M1.9 3.4a.9.9 0 0 1 .9-.9h3.1l1.4 1.8h5.9a.9.9 0 0 1 .9.9v7a.9.9 0 0 1-.9.9H2.8a.9.9 0 0 1-.9-.9v-8.8Z', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round' }));
    }

    function Spinner() {
      return h('span', { className: 'bd-spinner', 'aria-hidden': 'true' });
    }

    function CheckGlyph() {
      return h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('path', { d: 'm3.2 8.4 3 3 6.6-7', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }));
    }

    function WarnGlyph() {
      return h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('path', { d: 'M8 2.6 14 13H2L8 2.6Z', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round' }),
        h('path', { d: 'M8 6.6v3.1M8 11.4v.1', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }));
    }

    function StopGlyph() {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('rect', { x: 3.4, y: 3.4, width: 9.2, height: 9.2, rx: 1.6, fill: 'currentColor' }));
    }

    function Button(props) {
      const variant = props.variant || 'default';
      const classes = ['bd-btn'];
      if (variant !== 'default') classes.push('bd-btn-' + variant);
      return h('button', {
        type: 'button',
        className: classes.join(' ') + (props.className ? ' ' + props.className : ''),
        onClick: props.onClick,
        disabled: props.disabled,
        title: props.title,
      }, props.children);
    }

    function Field(props) {
      const tag = props.as === 'div' ? 'div' : 'label';
      return h(tag, { className: 'bd-field' + (props.wide ? ' bd-field-wide' : '') },
        h('span', { className: 'bd-label' }, props.label),
        props.children,
        props.hint ? h('span', { className: 'bd-field-hint' }, props.hint) : null);
    }

    function StateChip(props) {
      const state = props.state || 'pending';
      return h('span', { className: 'bd-chip bd-chip-' + state },
        state === 'running' || state === 'listing' ? h(Spinner) : null,
        stateText(props.t, state));
    }

    /* ------------------------------------------------------------------ */
    /* Panel                                                               */
    /* ------------------------------------------------------------------ */

    class PanelBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      render() {
        if (this.state.error) {
          const message = (this.state.error && (this.state.error.message || this.state.error)) || 'Unknown error';
          return h('div', { className: 'bd-root' },
            h('style', null, CSS),
            h('div', { className: 'bd-alert bd-alert-error', role: 'alert' },
              h('strong', null, 'B 站下载面板加载失败'),
              h('pre', { className: 'bd-pre' }, String(message)),
              h(Button, { onClick: () => this.setState({ error: null }) }, '重试')));
        }
        return this.props.children;
      }
    }

    function BiliBoundary(props) {
      return h(PanelBoundary, null, h(BiliPanel, props));
    }

    function BiliPanel(props) {
      const t = safeT(props.t);
      const [status, setStatus] = useState({ kind: 'loading' });
      const [settings, setSettings] = useState(null);
      const [uid, setUid] = useState(() => {
        try {
          return window.localStorage.getItem(STORAGE_UID) || '';
        } catch {
          return '';
        }
      });
      const [lookup, setLookup] = useState({ kind: 'idle' });
      const [limit, setLimit] = useState('');
      const [overwrite, setOverwrite] = useState(false);
      const [videoUrl, setVideoUrl] = useState('');
      const [sourceMode, setSourceMode] = useState('uid');
      const [installingFfmpeg, setInstallingFfmpeg] = useState(false);
      const [cookie, setCookie] = useState('');
      const [cookieBusy, setCookieBusy] = useState(false);
      const [notice, setNotice] = useState(null);
      const [job, setJob] = useState(null);
      const [busy, setBusy] = useState(false);
      const noticeTimer = useRef(0);
      const polling = useRef(false);

      const jobActive = Boolean(job && (job.state === 'running' || job.state === 'listing'));

      const notify = useCallback((text, kind, sticky) => {
        const level = kind || 'ok';
        setNotice({ text, kind: level });
        window.clearTimeout(noticeTimer.current);
        /* Errors and explicit sticky notices stay until dismissed. */
        if (level !== 'error' && !sticky) noticeTimer.current = window.setTimeout(() => setNotice(null), 5000);
      }, []);

      const loadStatus = useCallback(() => {
        setStatus(current => (current.kind === 'ready' ? { ...current, refreshing: true } : { kind: 'loading' }));
        call('status').then(
          data => {
            setStatus({ kind: 'ready', ...data });
            setSettings(current => current || data.settings);
            if (data.activeJob) setJob(data.activeJob);
          },
          error => setStatus(current => (current.kind === 'ready'
            ? { ...current, refreshing: false }
            : { kind: 'error', error: error.message })),
        );
      }, []);

      useEffect(() => {
        loadStatus();
        return () => {
          window.clearTimeout(noticeTimer.current);
        };
      }, [loadStatus]);

      /* Poll the running job without overlapping requests. */
      useEffect(() => {
        if (!job || (job.state !== 'running' && job.state !== 'listing')) return;
        const timer = window.setInterval(() => {
          if (polling.current) return;
          polling.current = true;
          call('job', { id: job.id }, 20000).then(
            data => setJob(data.job),
            () => {},
          ).finally(() => { polling.current = false; });
        }, 1200);
        return () => window.clearInterval(timer);
      }, [job && job.id, job && job.state]);

      useEffect(() => {
        if (!job || (job.state !== 'done' && job.state !== 'failed' && job.state !== 'canceled')) return;
        setBusy(false);
        loadStatus();
      }, [job && job.state]);

      const patchSettings = useCallback((patch) => {
        setSettings(current => Object.assign({}, current || {}, patch));
        call('saveSettings', patch).then(
          data => {
            setStatus(current => (current.kind === 'ready' ? Object.assign({}, current, { settings: data.settings, ffmpeg: data.ffmpeg }) : current));
          },
          error => notify(error.message, 'error'),
        );
      }, [notify]);

      const installFfmpeg = useCallback(() => {
        setInstallingFfmpeg(true);
        call('installFfmpeg', {}, 300000).then(
          data => {
            setInstallingFfmpeg(false);
            notify(t('ffmpegInstalled'));
            loadStatus();
          },
          error => {
            setInstallingFfmpeg(false);
            notify(error.message, 'error');
          },
        );
      }, [loadStatus, notify, t]);

      const browse = useCallback(() => {
        const picker = props.pickDirectory;
        if (typeof picker !== 'function') {
          notify(t('browseUnavailable'), 'warn');
          return;
        }
        Promise.resolve(picker()).then(
          path => {
            if (typeof path === 'string' && path) patchSettings({ outputDir: path });
          },
          error => notify((error && error.message) || t('browseFailed'), 'error'),
        );
      }, [patchSettings, props.pickDirectory, notify, t]);

      const saveCookie = useCallback(() => {
        const value = cookie.trim();
        if (!value) {
          notify(t('cookieEmpty'), 'error');
          return;
        }
        setCookieBusy(true);
        call('saveCookie', { cookie: value }).then(
          data => {
            setCookieBusy(false);
            setCookie('');
            if (data.warning) notify(data.warning, 'warn');
            else notify(t('cookieSaved'));
            loadStatus();
          },
          error => {
            setCookieBusy(false);
            notify(error.message, 'error');
          },
        );
      }, [cookie, loadStatus, notify, t]);

      const clearCookie = useCallback(() => {
        setCookieBusy(true);
        call('clearCookie').then(
          () => {
            setCookieBusy(false);
            setCookie('');
            notify(t('cookieCleared'));
            loadStatus();
          },
          error => {
            setCookieBusy(false);
            notify(error.message, 'error');
          },
        );
      }, [loadStatus, notify, t]);

      const runLookup = useCallback(() => {
        if (lookup.kind === 'loading' || lookup.kind === 'loading-user') return;
        const value = uid.trim();
        if (!/^\d{1,20}$/.test(value)) {
          notify(t('uidInvalid'), 'error');
          return;
        }
        try {
          window.localStorage.setItem(STORAGE_UID, value);
        } catch {
          // Local storage is optional.
        }
        setLookup({ kind: 'loading' });
        call('user', { uid: value }, 40000).then(
          user => {
            setLookup({ kind: 'loading-user', user });
            call('videos', { uid: value, limit: 30 }, 60000).then(
              data => setLookup({
                kind: 'ready',
                user: user.user,
                total: data.total,
                videos: data.videos,
                availableQualities: Array.isArray(data.availableQualities) ? data.availableQualities : [],
              }),
              error => setLookup({ kind: 'error', error: error.message }),
            );
          },
          error => setLookup({ kind: 'error', error: error.message }),
        );
      }, [uid, lookup.kind, notify, t]);

      const start = useCallback(() => {
        if (job && (job.state === 'running' || job.state === 'listing')) {
          notify(t('jobBusy'), 'warn');
          return;
        }
        const value = uid.trim();
        if (!/^\d{1,20}$/.test(value)) {
          notify(t('uidInvalid'), 'error');
          return;
        }
        if (status.kind !== 'ready' || !status.cookieConfigured) {
          notify(t('needCookie'), 'error');
          return;
        }
        if (settings && settings.mode === 'dash' && status.ffmpeg && !status.ffmpeg.found) {
          notify(t('needFfmpeg'), 'error');
          return;
        }
        const cap = Number(limit);
        setBusy(true);
        call('start', {
          uid: value,
          quality: settings ? settings.quality : undefined,
          mode: settings ? settings.mode : undefined,
          outputDir: settings ? settings.outputDir : undefined,
          includeParts: settings ? settings.includeParts : undefined,
          overwrite,
          limit: Number.isFinite(cap) && cap > 0 ? cap : undefined,
        }, 180000).then(
          data => {
            setJob(data.job);
            setBusy(false);
            notify(t('jobStarted'));
          },
          error => {
            setBusy(false);
            notify(error.message, 'error');
          },
        );
      }, [uid, limit, settings, status, job, notify, t]);

      const startUrl = useCallback(() => {
        if (jobActive) {
          notify(t('jobBusy'), 'warn');
          return;
        }
        const url = videoUrl.trim();
        if (!url) {
          notify(t('singleEmpty'), 'error');
          return;
        }
        if (status.kind !== 'ready') return;
        if (settings && settings.mode === 'dash' && status.ffmpeg && !status.ffmpeg.found) {
          notify(t('needFfmpeg'), 'error');
          return;
        }
        setBusy(true);
        call('startUrl', {
          url,
          quality: settings ? settings.quality : undefined,
          mode: settings ? settings.mode : undefined,
          outputDir: settings ? settings.outputDir : undefined,
          overwrite,
        }, 150000).then(
          data => {
            setJob(data.job);
            setBusy(false);
            setVideoUrl('');
            notify(t('jobStarted'));
          },
          error => {
            setBusy(false);
            notify(error.message, 'error');
          },
        );
      }, [videoUrl, jobActive, settings, status, overwrite, notify, t]);

      const stop = useCallback(() => {
        if (!job) return;
        call('cancel', { id: job.id }, 25000).then(
          data => {
            setJob(data.job);
            notify(t('stopped'));
          },
          error => notify(error.message, 'error'),
        );
      }, [job, notify, t]);

      const openFolder = useCallback(() => {
        const path = (job && job.folder) || (settings && settings.outputDir);
        if (!path) return;
        call('openFolder', { path }).then(
          data => notify(t('folderOpened', { path: (data && data.path) || path }), 'ok', true),
          error => notify(error.message, 'error'),
        );
      }, [job, settings, notify, t]);

      const ready = status.kind === 'ready';
      const loggedIn = ready && status.loggedIn;
      const qualityOptions = (ready && status.qualities && status.qualities.length
        ? status.qualities
        : [
          { id: '8k', label: '8K 超高清', hint: '需要大会员' },
          { id: '4k', label: '4K 超清', hint: '需要大会员' },
          { id: '1080p60', label: '1080P 60 帧', hint: '需要大会员' },
          { id: '1080p', label: '1080P 高清', hint: '需登录' },
          { id: '720p', label: '720P 准高清', hint: '未登录一般最高 720P' },
          { id: '480p', label: '480P 清晰', hint: '' },
          { id: '360p', label: '360P 流畅', hint: '' },
        ]);
      const currentQuality = settings ? settings.quality : (ready ? status.settings.quality : '1080p');

      const checking = ready && status.refreshing;
      const currentOption = qualityOptions.find(item => item.id === currentQuality);
      const qualityHint = currentOption && currentOption.hint ? currentOption.hint : '';
      const needsDash = currentQuality === '8k' || currentQuality === '4k' || currentQuality === '1080p60';
      const ffmpegReady = Boolean(ready && status.ffmpeg && status.ffmpeg.found);
      const availableOptions = (lookup.kind === 'ready' && Array.isArray(lookup.availableQualities) ? lookup.availableQualities : [])
        .filter(item => item.id);
      const bestAvailable = availableOptions[0];
      const pickedTooHigh = Boolean(bestAvailable && qualityRank(currentQuality) < qualityRank(bestAvailable.id));

      return h('div', { className: 'bd-root' },
        h('style', null, CSS),
        h('div', { className: 'bd-shell' },
          h('header', { className: 'bd-head' },
            h('div', { className: 'bd-head-main' },
              h('h1', { className: 'bd-title' }, t('title')),
              h('p', { className: 'bd-sub' }, t('subtitle'))),
            h('div', { className: 'bd-badges' },
              checking ? h('span', { className: 'bd-badge' }, h(Spinner), t('checking')) : null,
              h('span', {
                className: 'bd-badge'
                  + (loggedIn ? ' bd-badge-on' : (ready && status.cookieConfigured && status.unknown ? ' bd-badge-warn' : '')),
              },
                loggedIn ? h(CheckGlyph) : h(WarnGlyph),
                loggedIn
                  ? t('loginOn', { name: status.uname || '' })
                  : (ready && status.cookieConfigured && status.unknown ? t('loginUnknown') : t('loginOff'))),
              loggedIn && status.vip ? h('span', { className: 'bd-badge bd-badge-on' }, t('loginVip')) : null,
              ready && status.ffmpeg
                ? h('span', { className: 'bd-badge' + (status.ffmpeg.found ? ' bd-badge-on' : '') },
                  status.ffmpeg.found ? t('ffmpegOn') : t('ffmpegOff'))
                : null)),

          notice
            ? h('div', {
              className: 'bd-alert bd-alert-' + (notice.kind === 'ok' ? 'ok' : notice.kind === 'warn' ? 'warn' : 'error'),
              role: notice.kind === 'error' ? 'alert' : 'status',
            },
              h('span', { className: 'bd-alert-text' }, notice.text),
              h('button', {
                type: 'button',
                className: 'bd-alert-close',
                'aria-label': t('dismiss'),
                onClick: () => setNotice(null),
              }, '×'))
            : null,
          status.kind === 'error'
            ? h('div', { className: 'bd-alert bd-alert-error', role: 'alert' },
              h('span', null, t('errorTitle') + '：' + status.error),
              h(Button, { onClick: loadStatus }, t('retry')))
            : null,

          h('div', { className: 'bd-columns' },
            /* -------- settings -------- */
            h('section', { className: 'bd-card' },
              h('h2', { className: 'bd-card-title' }, t('settings')),

              /* The login cookie comes first: nothing else works without it. */
              h('h3', { className: 'bd-subtitle' }, t('cookieTitle')),
              ready && !status.cookieConfigured
                ? h('p', { className: 'bd-note' }, t('cookieNeeded'))
                : null,
              h('div', { className: 'bd-row' },
                h('input', {
                  className: 'bd-input bd-input-mono',
                  type: 'password',
                  autoComplete: 'off',
                  spellCheck: false,
                  placeholder: t('cookiePlaceholder'),
                  'aria-label': t('cookieTitle'),
                  value: cookie,
                  onChange: event => setCookie(event.target.value),
                  onKeyDown: event => {
                    if (event.key === 'Enter') saveCookie();
                  },
                }),
                h(Button, { variant: 'primary', onClick: saveCookie, disabled: cookieBusy || !cookie.trim() }, cookieBusy ? h(Spinner) : null, t('cookieSave')),
                ready && status.cookieConfigured
                  ? h(Button, { variant: 'ghost', onClick: clearCookie, disabled: cookieBusy }, t('cookieClear'))
                  : null),
              h('p', { className: 'bd-hint' }, t('cookieHint')),
              h('div', { className: 'bd-divider' }),

              h('div', { className: 'bd-grid2' },
                h(Field, { label: t('quality'), hint: qualityHint },
                  h('select', {
                    className: 'bd-input',
                    value: currentQuality,
                    disabled: !ready,
                    onChange: event => patchSettings({ quality: event.target.value }),
                  }, qualityOptions.map(option => h('option', { key: option.id, value: option.id }, qualityLabel(t, option.id, option.label))))),
                h(Field, { label: t('concurrency') },
                  h('select', {
                    className: 'bd-input',
                    value: settings ? String(settings.concurrency) : '2',
                    disabled: !ready,
                    onChange: event => patchSettings({ concurrency: Number(event.target.value) }),
                  }, [1, 2, 3, 4].map(value => h('option', { key: value, value: String(value) }, String(value)))))),
              needsDash && !ffmpegReady
                ? h('p', { className: 'bd-hint bd-hint-warn' }, t('qualityNeedsDash'))
                : null,
              h(Field, { label: t('mode'), wide: true },
                h('select', {
                  className: 'bd-input',
                  value: settings ? settings.mode : 'auto',
                  disabled: !ready,
                  onChange: event => patchSettings({ mode: event.target.value }),
                },
                h('option', { value: 'auto' }, t('modeAuto')),
                h('option', { value: 'file' }, t('modeFile')),
                h('option', { value: 'dash' }, t('modeDash')))),
              settings && settings.mode === 'file' && needsDash
                ? h('p', { className: 'bd-hint bd-hint-warn' }, t('fileCapHint'))
                : null,
              h(Field, { label: t('outputDir'), wide: true, as: 'div' },
                h('div', { className: 'bd-row' },
                  h('input', {
                    className: 'bd-input bd-input-mono',
                    type: 'text',
                    spellCheck: false,
                    'aria-label': t('outputDir'),
                    value: settings ? settings.outputDir : '',
                    disabled: !ready,
                    onChange: event => setSettings(current => Object.assign({}, current, { outputDir: event.target.value })),
                    onBlur: event => patchSettings({ outputDir: event.target.value }),
                    onKeyDown: event => {
                      if (event.key === 'Enter') patchSettings({ outputDir: event.target.value });
                    },
                  }),
                  h(Button, { onClick: browse, disabled: !ready || typeof props.pickDirectory !== 'function' }, h(FolderGlyph), t('browse')))),
              h(Field, { label: t('ffmpegPath'), wide: true, hint: ready && status.ffmpeg && status.ffmpeg.found ? t('ffmpegHintOn', { path: status.ffmpeg.path }) : t('ffmpegHintOff') },
                h('input', {
                  className: 'bd-input bd-input-mono',
                  type: 'text',
                  spellCheck: false,
                  placeholder: t('ffmpegPlaceholder'),
                  value: settings ? (settings.ffmpegPath || '') : '',
                  disabled: !ready,
                  onChange: event => setSettings(current => Object.assign({}, current, { ffmpegPath: event.target.value })),
                  onBlur: event => patchSettings({ ffmpegPath: event.target.value }),
                })),
              ready && status.ffmpeg && !status.ffmpeg.found
                ? h('div', { className: 'bd-row bd-install-row' },
                  h(Button, { variant: 'primary', onClick: installFfmpeg, disabled: installingFfmpeg },
                    installingFfmpeg ? h(Spinner) : null,
                    installingFfmpeg ? t('installingFfmpeg') : t('installFfmpeg')))
                : null,
              h('label', { className: 'bd-check' },
                h('input', {
                  type: 'checkbox',
                  checked: settings ? settings.includeParts !== false : true,
                  disabled: !ready,
                  onChange: event => patchSettings({ includeParts: event.target.checked }),
                }),
                t('includeParts'))),

            /* -------- download -------- */
            h('section', { className: 'bd-card' },
              h('div', { className: 'bd-card-head' },
                h('h2', { className: 'bd-card-title' }, t('downloadTitle')),
                h('div', { className: 'bd-tabs', role: 'tablist', 'aria-label': t('downloadTitle') },
                  h('button', {
                    type: 'button',
                    role: 'tab',
                    'aria-selected': sourceMode === 'uid',
                    className: 'bd-tab' + (sourceMode === 'uid' ? ' bd-tab-on' : ''),
                    onClick: () => setSourceMode('uid'),
                  }, t('modeByUid')),
                  h('button', {
                    type: 'button',
                    role: 'tab',
                    'aria-selected': sourceMode === 'link',
                    className: 'bd-tab' + (sourceMode === 'link' ? ' bd-tab-on' : ''),
                    onClick: () => setSourceMode('link'),
                  }, t('modeByLink')))),
              sourceMode === 'uid'
                ? h('div', null,
                  h(Field, { label: t('uid'), wide: true, as: 'div' },
                    h('div', { className: 'bd-row' },
                      h('input', {
                        className: 'bd-input bd-input-mono',
                        type: 'text',
                        inputMode: 'numeric',
                        spellCheck: false,
                        placeholder: t('uidPlaceholder'),
                        'aria-label': t('uid'),
                        value: uid,
                        onChange: event => {
                          setUid(event.target.value.replace(/\D/g, ''));
                          setLookup({ kind: 'idle' });
                        },
                        onKeyDown: event => {
                          if (event.key === 'Enter') runLookup();
                        },
                      }),
                      h(Button, {
                        onClick: runLookup,
                        disabled: lookup.kind === 'loading' || lookup.kind === 'loading-user' || !uid.trim(),
                      },
                        lookup.kind === 'loading' || lookup.kind === 'loading-user' ? h(Spinner) : null,
                        lookup.kind === 'loading' || lookup.kind === 'loading-user' ? t('lookupLoading') : t('lookup')))),
                  lookup.kind === 'ready' || lookup.kind === 'loading-user'
                    ? h('div', { className: 'bd-user' },
                      lookup.user && lookup.user.face ? h('img', { className: 'bd-avatar', src: lookup.user.face, alt: '', loading: 'lazy' }) : null,
                      h('div', { className: 'bd-user-text' },
                        h('div', { className: 'bd-user-name' }, lookup.user ? lookup.user.name : ''),
                        h('div', { className: 'bd-user-meta' },
                          lookup.kind === 'ready'
                            ? t('videosCount', { n: formatCount(lookup.total) })
                            : t('loading')),
                        lookup.kind === 'ready' && availableOptions.length
                          ? h('div', { className: 'bd-user-meta' },
                            t('availableQualities', {
                              list: availableOptions.map(item => qualityLabel(t, item.id, item.label)).join(' / '),
                            }))
                          : null,
                        pickedTooHigh
                          ? h('div', { className: 'bd-user-meta bd-user-warn' },
                            t('pickedTooHigh', { actual: qualityLabel(t, bestAvailable.id, bestAvailable.label) }))
                          : null),
                      lookup.kind === 'ready'
                        ? h('div', { className: 'bd-preview' },
                          lookup.videos.slice(0, 3).map(video => h('div', { className: 'bd-preview-row', key: video.bvid },
                            h('span', { className: 'bd-preview-name', title: video.title }, video.title),
                            video.duration ? h('span', { className: 'bd-preview-meta' }, video.duration) : null)))
                        : null)
                    : null,
                  lookup.kind === 'error'
                    ? h('div', { className: 'bd-alert bd-alert-error', role: 'alert' }, lookup.error)
                    : null,
                  h('div', { className: 'bd-grid2 bd-start-row' },
                    h(Field, { label: t('limit') },
                      h('input', {
                        className: 'bd-input',
                        type: 'text',
                        inputMode: 'numeric',
                        placeholder: t('limitPlaceholder'),
                        value: limit,
                        onChange: event => setLimit(event.target.value.replace(/[^\d]/g, '').replace(/^0+/, '')),
                      })),
                    h('div', { className: 'bd-start-cell' },
                      h(Button, {
                        variant: 'primary',
                        className: 'bd-btn-lg',
                        onClick: start,
                        disabled: busy || jobActive || !ready || !status.cookieConfigured || !uid.trim(),
                      },
                        busy ? h(Spinner) : h(DownloadGlyph),
                        busy ? t('starting') : t('start')))))
                : h('div', null,
                  h(Field, { label: t('linkLabel'), wide: true, as: 'div' },
                    h('div', { className: 'bd-row' },
                      h('input', {
                        className: 'bd-input bd-input-mono',
                        type: 'text',
                        spellCheck: false,
                        placeholder: t('singlePlaceholder'),
                        'aria-label': t('linkLabel'),
                        value: videoUrl,
                        onChange: event => setVideoUrl(event.target.value),
                        onKeyDown: event => {
                          if (event.key === 'Enter') startUrl();
                        },
                      }),
                      h(Button, {
                        variant: 'primary',
                        onClick: startUrl,
                        disabled: busy || jobActive || !videoUrl.trim(),
                      }, busy ? h(Spinner) : h(DownloadGlyph), t('singleStart')))),
                  h('p', { className: 'bd-hint' }, t('linkUsesSettings', {
                    quality: qualityLabel(t, currentQuality),
                    mode: modeText(t, settings ? settings.mode : 'auto'),
                    dir: settings ? settings.outputDir : '',
                  }))),
              h('label', { className: 'bd-check' },
                h('input', {
                  type: 'checkbox',
                  checked: overwrite,
                  disabled: !ready,
                  onChange: event => setOverwrite(event.target.checked),
                }),
                t('overwrite')),
              jobActive ? h('p', { className: 'bd-hint' }, t('jobBusyHint')) : null,
              ready && !status.cookieConfigured && sourceMode === 'uid'
                ? h('p', { className: 'bd-hint bd-hint-warn' }, t('startHint'))
                : null,
              job
                ? h('div', { className: 'bd-progress' },
                  h('div', { className: 'bd-progress-head' },
                    h('span', { className: 'bd-progress-title' }, (job.uname || '') + ' · ' + stateText(t, job.state)),
                    h('span', { className: 'bd-progress-nums' }, t('progressLine', { done: job.done, total: job.total || '?' }))),
                  h('div', {
                    className: 'bd-bar',
                    role: 'progressbar',
                    'aria-valuemin': 0,
                    ...(job.total > 0
                      ? {
                        'aria-valuemax': job.total,
                        'aria-valuenow': Math.min(job.total, job.done + job.failed + job.skipped),
                      }
                      : {}),
                    'aria-label': t('progress'),
                  },
                    h('div', {
                      className: 'bd-bar-fill',
                      style: { width: (job.total > 0 ? Math.min(100, Math.max(0, ((job.done + job.failed + job.skipped) / job.total) * 100)) : (job.state === 'listing' ? 8 : 0)) + '%' },
                    })),
                  job.state === 'failed' && job.message
                    ? h('div', { className: 'bd-alert bd-alert-error', role: 'alert' }, job.message)
                    : (job.message ? h('div', { className: 'bd-progress-line', 'aria-live': 'polite' }, job.message) : null),
                  job.currentFile ? h('div', { className: 'bd-progress-line bd-ellipsis' }, t('currentFile', { name: job.currentFile })) : null,
                  job.currentBytes > 0
                    ? h('div', { className: 'bd-progress-line' }, t('currentBytes', { done: formatBytes(job.currentBytes), total: job.currentTotal > 0 ? formatBytes(job.currentTotal) : '?' }))
                    : null,
                  job.qualityCapped
                    ? h('p', { className: 'bd-hint bd-hint-warn' }, t('qualityCapped', {
                      requested: qualityLabel(t, job.quality, job.qualityLabel),
                      actual: qualityLabel(t, job.achievedQuality),
                    }))
                    : null,
                  job.note ? h('p', { className: 'bd-hint bd-hint-warn' }, job.note) : null,
                  h('div', { className: 'bd-progress-foot' },
                    h('div', { className: 'bd-stats' },
                      h('span', null, t('failedLine', { failed: job.failed })),
                      h('span', null, t('skippedLine', { skipped: job.skipped })),
                      h('span', { className: 'bd-ellipsis' }, t('detailSummary', { mode: modeText(t, job.mode) })),
                      h('span', null, t('requestedQuality', { quality: qualityLabel(t, job.quality, job.qualityLabel) }))),
                    h('div', { className: 'bd-row' },
                      job.state === 'running' || job.state === 'listing'
                        ? h(Button, { variant: 'danger', onClick: stop }, h(StopGlyph), t('stop'))
                        : null,
                      h(Button, { onClick: openFolder }, h(FolderGlyph), t('openFolder')))))
                : null)),

          /* -------- queue -------- */
          job && job.items && job.items.length
            ? h('section', { className: 'bd-card bd-queue' },
              h('div', { className: 'bd-queue-head' },
                h('h2', { className: 'bd-card-title' }, t('queue')),
                h('span', { className: 'bd-queue-count' }, job.items.length + (job.itemsTruncated ? '+' : ''))),
              h('div', { className: 'bd-queue-list' },
                job.items.slice().reverse().map(item => h('div', { className: 'bd-queue-row', key: item.bvid + item.title },
                  h(StateChip, { t, state: item.state }),
                  h('span', { className: 'bd-queue-name', title: item.title }, item.title),
                  item.error ? h('span', { className: 'bd-queue-error', title: item.error }, item.error) : null,
                  item.quality ? h('span', { className: 'bd-queue-meta' }, qualityLabel(t, item.quality, item.qualityLabel)) : null,
                  item.files > 0 ? h('span', { className: 'bd-queue-meta' }, t('detailFiles', { n: item.files })) : null))),
              job.itemsTruncated ? h('p', { className: 'bd-hint' }, t('queueMore', { n: job.items.length })) : null)
            : null)
    );
    }

    /* ------------------------------------------------------------------ */
    /* Styles                                                              */
    /* ------------------------------------------------------------------ */

    const CSS = `
.bd-root { box-sizing: border-box; height: 100%; overflow: auto; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.bd-shell { box-sizing: border-box; width: 100%; max-width: 1040px; margin: 0 auto; padding: 22px 24px 28px; display: flex; flex-direction: column; gap: 14px; }
.bd-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.bd-head-main { min-width: 0; }
.bd-title { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: .2px; }
.bd-sub { margin: 5px 0 0; max-width: 62ch; color: var(--dsw-alias-label-secondary); font-size: 12.5px; line-height: 1.6; }
.bd-badges { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.bd-badge { display: inline-flex; align-items: center; gap: 5px; max-width: 30ch; overflow: hidden; text-overflow: ellipsis; padding: 3px 9px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 999px; color: var(--dsw-alias-label-secondary); font-size: 11.5px; white-space: nowrap; }
.bd-badge-on { border-color: var(--dsw-alias-state-success-primary); color: var(--dsw-alias-state-success-primary); }
.bd-badge-warn { border-color: var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-state-warn-primary); }
.bd-columns { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
@media (min-width: 900px) { .bd-columns { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; } }
.bd-card { box-sizing: border-box; padding: 16px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); }
.bd-card-title { margin: 0 0 12px; font-size: 13.5px; font-weight: 600; }
.bd-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.bd-card-head .bd-card-title { margin: 0; }
.bd-tabs { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 9px; background: var(--dsw-alias-bg-layer-2); }
.bd-tab { height: 26px; padding: 0 10px; border: 0; border-radius: 7px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.bd-tab:hover { color: var(--dsw-alias-label-primary); }
.bd-tab-on { background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.bd-tab:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 1px; }
.bd-subtitle { margin: 0 0 8px; font-size: 12.5px; font-weight: 600; }
.bd-grid2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 12px; }
.bd-field { display: block; margin-bottom: 12px; min-width: 0; }
.bd-field-wide { grid-column: 1 / -1; }
.bd-label { display: block; margin-bottom: 5px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.bd-field-hint { display: block; margin-top: 5px; color: var(--dsw-alias-label-secondary); font-size: 11.5px; line-height: 1.55; }
.bd-input { box-sizing: border-box; width: 100%; height: 34px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; }
.bd-input-mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12.5px; }
.bd-input:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 1px; }
.bd-input:disabled { opacity: .55; }
.bd-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.bd-row .bd-input { flex: 1 1 auto; min-width: 0; }
.bd-btn { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12.5px; white-space: nowrap; cursor: pointer; }
.bd-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.bd-btn:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 1px; }
.bd-btn:disabled { opacity: .5; cursor: default; }
.bd-btn-primary { border-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); }
.bd-btn-danger { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.bd-btn-ghost { border-style: dashed; color: var(--dsw-alias-label-secondary); }
.bd-btn-lg { width: 100%; height: 38px; justify-content: center; font-size: 13px; }
.bd-check { display: flex; align-items: center; gap: 7px; margin: 2px 0 0; color: var(--dsw-alias-label-primary); font-size: 12.5px; }
.bd-check input { accent-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); }
.bd-divider { height: 1px; margin: 14px 0; background: var(--dsw-alias-border-l2); }
.bd-note { margin: 0 0 10px; padding: 9px 11px; border: 1px solid var(--dsw-alias-state-warn-primary); border-radius: 9px; color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 1.6; }
.bd-hint { margin: 8px 0 0; color: var(--dsw-alias-label-secondary); font-size: 11.5px; line-height: 1.6; }
.bd-hint-warn { color: var(--dsw-alias-state-warn-primary); }
.bd-install-row { margin: -4px 0 12px; }
.bd-alert { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 12px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); font-size: 12.5px; line-height: 1.55; }
.bd-alert-text { flex: 1 1 auto; min-width: 0; }
.bd-alert-close { flex: 0 0 auto; width: 22px; height: 22px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 15px; line-height: 1; cursor: pointer; }
.bd-alert-close:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.bd-alert-close:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); }
.bd-alert-ok { border-color: var(--dsw-alias-state-success-primary); }
.bd-alert-warn { border-color: var(--dsw-alias-state-warn-primary); }
.bd-alert-error { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-label-primary); }
.bd-user { display: flex; align-items: center; gap: 10px; margin: 2px 0 12px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 11px; background: var(--dsw-alias-bg-layer-2); }
.bd-avatar { flex: 0 0 auto; width: 38px; height: 38px; border-radius: 50%; object-fit: cover; background: var(--dsw-alias-bg-base); }
.bd-user-text { min-width: 0; flex: 1 1 auto; }
.bd-user-name { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bd-user-meta { margin-top: 2px; color: var(--dsw-alias-label-secondary); font-size: 11.5px; }
.bd-user-warn { color: var(--dsw-alias-state-warn-primary); }
.bd-preview { flex: 1 1 46%; min-width: 0; padding-left: 10px; border-left: 1px solid var(--dsw-alias-border-l2); }
.bd-preview-row { display: flex; align-items: baseline; gap: 8px; font-size: 11.5px; line-height: 1.7; color: var(--dsw-alias-label-secondary); }
.bd-preview-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bd-preview-meta { flex: 0 0 auto; font-variant-numeric: tabular-nums; }
.bd-start-row { align-items: end; }
.bd-start-cell { padding-bottom: 12px; }
.bd-progress { margin-top: 4px; padding: 12px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 11px; background: var(--dsw-alias-bg-layer-2); }
.bd-progress-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.bd-progress-title { font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bd-progress-nums { flex: 0 0 auto; color: var(--dsw-alias-label-secondary); font-size: 11.5px; }
.bd-bar { height: 5px; margin: 9px 0 8px; border-radius: 999px; background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
.bd-bar-fill { height: 100%; border-radius: 999px; background: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); transition: width .35s ease; }
.bd-progress-line { margin-top: 3px; color: var(--dsw-alias-label-secondary); font-size: 11.5px; line-height: 1.5; }
.bd-progress-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
.bd-stats { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--dsw-alias-label-secondary); font-size: 11.5px; min-width: 0; }
.bd-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.bd-queue-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
.bd-queue-head .bd-card-title { margin: 0; }
.bd-queue-count { color: var(--dsw-alias-label-secondary); font-size: 11.5px; }
.bd-queue-list { display: flex; flex-direction: column; }
.bd-queue-row { display: flex; align-items: center; gap: 9px; padding: 7px 2px; border-bottom: 1px solid var(--dsw-alias-border-l2); font-size: 12.5px; }
.bd-queue-row:last-child { border-bottom: 0; }
.bd-queue-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bd-queue-meta { flex: 0 0 auto; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.bd-queue-error { flex: 0 1 46%; min-width: 0; white-space: normal; word-break: break-word; color: var(--dsw-alias-state-error-primary); font-size: 11px; line-height: 1.45; }
.bd-chip { display: inline-flex; align-items: center; gap: 5px; flex: 0 0 auto; padding: 1px 8px; border: 1px solid var(--dsw-alias-border-l3); border-radius: 999px; color: var(--dsw-alias-label-secondary); font-size: 10.5px; line-height: 16px; }
.bd-chip-running, .bd-chip-listing { border-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); }
.bd-chip-done { border-color: var(--dsw-alias-state-success-primary); color: var(--dsw-alias-state-success-primary); }
.bd-chip-failed { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.bd-chip-skipped { border-color: var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-state-warn-primary); }
.bd-chip-canceled { border-color: var(--dsw-alias-border-l2); }
.bd-spinner { display: inline-block; width: 11px; height: 11px; border: 2px solid var(--dsw-alias-border-l2); border-top-color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); border-radius: 50%; animation: bd-spin .8s linear infinite; }
@keyframes bd-spin { to { transform: rotate(360deg); } }
.bd-pre { margin: 8px 0 0; color: var(--dsw-alias-label-secondary); font: 12px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; word-break: break-word; }
@media (max-width: 720px) {
  .bd-shell { padding: 16px 14px 24px; }
  .bd-head { flex-direction: column; }
  .bd-badges { justify-content: flex-start; }
  .bd-grid2 { grid-template-columns: minmax(0, 1fr); }
  .bd-user { flex-wrap: wrap; }
  .bd-preview { flex: 1 1 100%; padding-left: 0; border-left: 0; padding-top: 8px; border-top: 1px solid var(--dsw-alias-border-l2); }
}
@media (prefers-reduced-motion: reduce) { .bd-bar-fill { transition: none; } .bd-spinner { animation-duration: 2.4s; } }
`;

    /* ------------------------------------------------------------------ */
    /* Registration                                                        */
    /* ------------------------------------------------------------------ */

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'bilibili-downloader: dictionaries');
        const t = localized(ctx.locale.bind(NS));
        const pickDirectory = () => {
          const workspace = ctx.get('uiWorkspace');
          if (workspace && typeof workspace.pickDirectory === 'function') return workspace.pickDirectory();
          return Promise.resolve(null);
        };
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 40,
          locale: NS,
          label: () => t('panel'),
        }, BiliIcon));
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
          inject: () => ({ t, pickDirectory }),
        }, BiliBoundary));
      },
    };
  },
});
