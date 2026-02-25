import { invoke } from "@tauri-apps/api/core"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { AppShell } from "@/components/app/app-shell"
import { type PluginContextAction } from "@/components/side-nav"
import { useAppPluginViews } from "@/hooks/app/use-app-plugin-views"
import { useProbe } from "@/hooks/app/use-probe"
import { useSettingsBootstrap } from "@/hooks/app/use-settings-bootstrap"
import { useSettingsDisplayActions } from "@/hooks/app/use-settings-display-actions"
import { useSettingsPluginActions } from "@/hooks/app/use-settings-plugin-actions"
import { useSettingsPluginList } from "@/hooks/app/use-settings-plugin-list"
import { useSettingsSystemActions } from "@/hooks/app/use-settings-system-actions"
import { useSettingsTheme } from "@/hooks/app/use-settings-theme"
import { useTrayIcon } from "@/hooks/app/use-tray-icon"
import { track } from "@/lib/analytics"
import {
  buildAccountOptionsByPlugin,
  filterCliProxySelectionsForProbe,
  HIDDEN_PLUGIN_IDS,
  OVERLAY_ENABLED_PLUGIN_IDS,
  toCliProxyConfigView,
  type CliProxyAuthFile,
  type CliProxyConfigView,
} from "@/lib/cliproxy-ui"
import {
  REFRESH_COOLDOWN_MS,
  getEnabledPluginIds,
  loadCliProxyAccountSelections,
  saveCliProxyAccountSelections,
  savePluginSettings,
  type CliProxyAccountSelections,
} from "@/lib/settings"
import { useAppPluginStore } from "@/stores/app-plugin-store"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"

const TRAY_PROBE_DEBOUNCE_MS = 500
const TRAY_SETTINGS_DEBOUNCE_MS = 2000

function reconcileCliProxySelections(
  authFiles: CliProxyAuthFile[],
  selections: CliProxyAccountSelections
) {
  const optionsByPlugin = buildAccountOptionsByPlugin(authFiles)
  const nextSelections: CliProxyAccountSelections = { ...selections }

  for (const [pluginId, options] of Object.entries(optionsByPlugin)) {
    if (options.length === 0) continue
    const current = (nextSelections[pluginId] || "").trim()
    if (!current || !options.some((option) => option.value === current)) {
      nextSelections[pluginId] = options[0].value
    }
  }

  for (const pluginId of OVERLAY_ENABLED_PLUGIN_IDS) {
    if (optionsByPlugin[pluginId]?.length) continue
    delete nextSelections[pluginId]
  }

  return nextSelections
}

function App() {
  const {
    activeView,
    setActiveView,
  } = useAppUiStore(
    useShallow((state) => ({
      activeView: state.activeView,
      setActiveView: state.setActiveView,
    }))
  )

  const {
    pluginsMeta,
    setPluginsMeta,
    pluginSettings,
    setPluginSettings,
  } = useAppPluginStore(
    useShallow((state) => ({
      pluginsMeta: state.pluginsMeta,
      setPluginsMeta: state.setPluginsMeta,
      pluginSettings: state.pluginSettings,
      setPluginSettings: state.setPluginSettings,
    }))
  )

  const {
    autoUpdateInterval,
    setAutoUpdateInterval,
    themeMode,
    setThemeMode,
    displayMode,
    setDisplayMode,
    menubarIconStyle,
    setMenubarIconStyle,
    resetTimerDisplayMode,
    setResetTimerDisplayMode,
    setGlobalShortcut,
    setStartOnLogin,
  } = useAppPreferencesStore(
    useShallow((state) => ({
      autoUpdateInterval: state.autoUpdateInterval,
      setAutoUpdateInterval: state.setAutoUpdateInterval,
      themeMode: state.themeMode,
      setThemeMode: state.setThemeMode,
      displayMode: state.displayMode,
      setDisplayMode: state.setDisplayMode,
      menubarIconStyle: state.menubarIconStyle,
      setMenubarIconStyle: state.setMenubarIconStyle,
      resetTimerDisplayMode: state.resetTimerDisplayMode,
      setResetTimerDisplayMode: state.setResetTimerDisplayMode,
      setGlobalShortcut: state.setGlobalShortcut,
      setStartOnLogin: state.setStartOnLogin,
    }))
  )

  const [cliProxyConfigured, setCliProxyConfigured] = useState(false)
  const [cliProxyBaseUrl, setCliProxyBaseUrl] = useState("")
  const [cliProxyApiKey, setCliProxyApiKey] = useState("")
  const [cliProxyAuthFiles, setCliProxyAuthFiles] = useState<CliProxyAuthFile[]>([])
  const [cliProxyBusy, setCliProxyBusy] = useState(false)
  const [cliProxyError, setCliProxyError] = useState<string | null>(null)
  const [cliProxySelections, setCliProxySelections] = useState<CliProxyAccountSelections>({})

  const cliProxySelectionsRef = useRef<CliProxyAccountSelections>({})
  useEffect(() => {
    cliProxySelectionsRef.current = cliProxySelections
  }, [cliProxySelections])

  const accountOptionsByPlugin = useMemo(
    () => buildAccountOptionsByPlugin(cliProxyAuthFiles),
    [cliProxyAuthFiles]
  )

  const selectedAccountByPlugin = useMemo(() => {
    const next: CliProxyAccountSelections = {}
    for (const [pluginId, options] of Object.entries(accountOptionsByPlugin)) {
      if (options.length === 0) continue
      const configured = (cliProxySelections[pluginId] || "").trim()
      const matched = options.find((option) => option.value === configured)
      next[pluginId] = matched?.value ?? options[0].value
    }
    return next
  }, [accountOptionsByPlugin, cliProxySelections])

  const resolveStartBatchOptions = useCallback(() => {
    const accountSelections = filterCliProxySelectionsForProbe(cliProxySelectionsRef.current)
    if (Object.keys(accountSelections).length === 0) return undefined
    return { accountSelections }
  }, [])

  const scheduleProbeTrayUpdateRef = useRef<() => void>(() => {})
  const handleProbeResult = useCallback(() => {
    scheduleProbeTrayUpdateRef.current()
  }, [])

  const {
    pluginStates,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
    autoUpdateNextAt,
    setAutoUpdateNextAt,
    handleRetryPlugin,
    handleRefreshAll,
  } = useProbe({
    pluginSettings,
    autoUpdateInterval,
    onProbeResult: handleProbeResult,
    resolveStartBatchOptions,
  })

  const refreshCliProxyAuthFiles = useCallback(async () => {
    const authFiles = await invoke<CliProxyAuthFile[]>("cliproxyapi_list_auth_files")
    const nextSelections = reconcileCliProxySelections(authFiles, cliProxySelectionsRef.current)

    cliProxySelectionsRef.current = nextSelections
    setCliProxyAuthFiles(authFiles)
    setCliProxySelections(nextSelections)
    await saveCliProxyAccountSelections(nextSelections)

    return { authFiles, nextSelections }
  }, [])

  const initializeCliProxyState = useCallback(async () => {
    let storedSelections: CliProxyAccountSelections = {}
    try {
      storedSelections = await loadCliProxyAccountSelections()
    } catch (error) {
      console.error("Failed to load CLIProxy account selections:", error)
    }

    let cliProxyConfig: CliProxyConfigView = { configured: false, baseUrl: null }
    try {
      const rawConfig = await invoke<unknown>("cliproxyapi_get_config")
      cliProxyConfig = toCliProxyConfigView(rawConfig)
    } catch (error) {
      console.error("Failed to load CLIProxy config:", error)
    }

    let authFiles: CliProxyAuthFile[] = []
    if (cliProxyConfig.configured) {
      try {
        authFiles = await invoke<CliProxyAuthFile[]>("cliproxyapi_list_auth_files")
      } catch (error) {
        console.error("Failed to list CLIProxy auth files:", error)
      }
    }

    const effectiveSelections = reconcileCliProxySelections(authFiles, storedSelections)
    cliProxySelectionsRef.current = effectiveSelections

    setCliProxyConfigured(cliProxyConfig.configured)
    setCliProxyBaseUrl(cliProxyConfig.baseUrl ?? "")
    setCliProxyApiKey("")
    setCliProxyAuthFiles(authFiles)
    setCliProxySelections(effectiveSelections)
    setCliProxyError(null)

    void saveCliProxyAccountSelections(effectiveSelections).catch((error) => {
      console.error("Failed to persist CLIProxy account selections:", error)
    })
  }, [])

  const { scheduleTrayIconUpdate, traySettingsPreview } = useTrayIcon({
    pluginsMeta,
    pluginSettings,
    pluginStates,
    displayMode,
    menubarIconStyle,
    activeView,
  })

  useEffect(() => {
    scheduleProbeTrayUpdateRef.current = () => {
      scheduleTrayIconUpdate("probe", TRAY_PROBE_DEBOUNCE_MS)
    }
  }, [scheduleTrayIconUpdate])

  const { applyStartOnLogin } = useSettingsBootstrap({
    setPluginSettings,
    setPluginsMeta,
    setAutoUpdateInterval,
    setThemeMode,
    setDisplayMode,
    setMenubarIconStyle,
    setResetTimerDisplayMode,
    setGlobalShortcut,
    setStartOnLogin,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
    beforeInitialProbe: initializeCliProxyState,
  })

  useSettingsTheme(themeMode)

  const {
    handleThemeModeChange,
    handleDisplayModeChange,
    handleResetTimerDisplayModeChange,
    handleResetTimerDisplayModeToggle,
    handleMenubarIconStyleChange,
  } = useSettingsDisplayActions({
    setThemeMode,
    setDisplayMode,
    resetTimerDisplayMode,
    setResetTimerDisplayMode,
    setMenubarIconStyle,
    scheduleTrayIconUpdate,
  })

  const {
    handleAutoUpdateIntervalChange,
    handleGlobalShortcutChange,
    handleStartOnLoginChange,
  } = useSettingsSystemActions({
    pluginSettings,
    setAutoUpdateInterval,
    setAutoUpdateNextAt,
    setGlobalShortcut,
    setStartOnLogin,
    applyStartOnLogin,
  })

  const {
    handleReorder,
    handleToggle,
  } = useSettingsPluginActions({
    pluginSettings,
    setPluginSettings,
    setLoadingForPlugins,
    setErrorForPlugins,
    startBatch,
    scheduleTrayIconUpdate,
  })

  const settingsPlugins = useSettingsPluginList({
    pluginSettings,
    pluginsMeta,
  })
  const visibleSettingsPlugins = useMemo(
    () => settingsPlugins.filter((plugin) => !HIDDEN_PLUGIN_IDS.has(plugin.id)),
    [settingsPlugins]
  )

  const { displayPlugins, navPlugins, selectedPlugin } = useAppPluginViews({
    activeView,
    setActiveView,
    pluginSettings,
    pluginsMeta,
    pluginStates,
  })

  const pluginSettingsRef = useRef(pluginSettings)
  useEffect(() => {
    pluginSettingsRef.current = pluginSettings
  }, [pluginSettings])

  const handleAccountSelectionChange = useCallback(
    (pluginId: string, account: string) => {
      const selected = account.trim()
      const current = (cliProxySelectionsRef.current[pluginId] || "").trim()
      if (!selected || selected === current) return

      const nextSelections: CliProxyAccountSelections = {
        ...cliProxySelectionsRef.current,
        [pluginId]: selected,
      }

      cliProxySelectionsRef.current = nextSelections
      setCliProxySelections(nextSelections)
      void saveCliProxyAccountSelections(nextSelections).catch((error) => {
        console.error("Failed to save CLIProxy account selections:", error)
      })

      setLoadingForPlugins([pluginId])
      startBatch([pluginId]).catch((error) => {
        console.error("Failed to refresh plugin with selected account:", error)
        setErrorForPlugins([pluginId], "Failed to start probe")
      })
    },
    [setErrorForPlugins, setLoadingForPlugins, startBatch]
  )

  const handleCliProxySave = useCallback(async () => {
    setCliProxyBusy(true)
    setCliProxyError(null)
    try {
      await invoke("cliproxyapi_set_config", {
        baseUrl: cliProxyBaseUrl,
        apiKey: cliProxyApiKey,
      })

      const rawConfig = await invoke<unknown>("cliproxyapi_get_config")
      const config = toCliProxyConfigView(rawConfig)
      setCliProxyConfigured(config.configured)
      setCliProxyBaseUrl(config.baseUrl ?? "")
      setCliProxyApiKey("")

      const { nextSelections } = await refreshCliProxyAuthFiles()
      cliProxySelectionsRef.current = nextSelections

      const currentSettings = pluginSettingsRef.current
      if (currentSettings) {
        const enabledIds = getEnabledPluginIds(currentSettings)
        if (enabledIds.length > 0) {
          setLoadingForPlugins(enabledIds)
          await startBatch(enabledIds)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setCliProxyError(message)
    } finally {
      setCliProxyBusy(false)
    }
  }, [
    cliProxyApiKey,
    cliProxyBaseUrl,
    refreshCliProxyAuthFiles,
    setLoadingForPlugins,
    startBatch,
  ])

  const handleCliProxyRefresh = useCallback(async () => {
    setCliProxyBusy(true)
    setCliProxyError(null)
    try {
      await refreshCliProxyAuthFiles()
      setCliProxyConfigured(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setCliProxyError(message)
    } finally {
      setCliProxyBusy(false)
    }
  }, [refreshCliProxyAuthFiles])

  const handleCliProxyClear = useCallback(async () => {
    setCliProxyBusy(true)
    setCliProxyError(null)
    try {
      await invoke("cliproxyapi_clear_config")
      setCliProxyConfigured(false)
      setCliProxyBaseUrl("")
      setCliProxyApiKey("")
      setCliProxyAuthFiles([])

      const nextSelections: CliProxyAccountSelections = { ...cliProxySelectionsRef.current }
      for (const pluginId of OVERLAY_ENABLED_PLUGIN_IDS) {
        delete nextSelections[pluginId]
      }
      cliProxySelectionsRef.current = nextSelections
      setCliProxySelections(nextSelections)
      await saveCliProxyAccountSelections(nextSelections)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setCliProxyError(message)
    } finally {
      setCliProxyBusy(false)
    }
  }, [])

  const handlePluginContextAction = useCallback(
    (pluginId: string, action: PluginContextAction) => {
      if (action === "reload") {
        handleRetryPlugin(pluginId)
        return
      }

      const currentSettings = pluginSettingsRef.current
      if (!currentSettings) return
      const alreadyDisabled = currentSettings.disabled.includes(pluginId)
      if (alreadyDisabled) return

      track("provider_toggled", { provider_id: pluginId, enabled: "false" })
      const nextSettings = {
        ...currentSettings,
        disabled: [...currentSettings.disabled, pluginId],
      }
      setPluginSettings(nextSettings)
      scheduleTrayIconUpdate("settings", TRAY_SETTINGS_DEBOUNCE_MS)
      void savePluginSettings(nextSettings).catch((error) => {
        console.error("Failed to save plugin toggle:", error)
      })

      if (activeView === pluginId) {
        setActiveView("home")
      }
    },
    [activeView, handleRetryPlugin, scheduleTrayIconUpdate, setActiveView, setPluginSettings]
  )

  const isPluginRefreshAvailable = useCallback(
    (pluginId: string) => {
      const pluginState = pluginStates[pluginId]
      if (!pluginState) return true
      if (pluginState.loading) return false
      if (!pluginState.lastManualRefreshAt) return true
      return Date.now() - pluginState.lastManualRefreshAt >= REFRESH_COOLDOWN_MS
    },
    [pluginStates]
  )

  return (
    <AppShell
      onRefreshAll={handleRefreshAll}
      navPlugins={navPlugins}
      displayPlugins={displayPlugins}
      settingsPlugins={visibleSettingsPlugins}
      autoUpdateNextAt={autoUpdateNextAt}
      selectedPlugin={selectedPlugin}
      onPluginContextAction={handlePluginContextAction}
      isPluginRefreshAvailable={isPluginRefreshAvailable}
      appContentProps={{
        onRetryPlugin: handleRetryPlugin,
        onReorder: handleReorder,
        onToggle: handleToggle,
        onAutoUpdateIntervalChange: handleAutoUpdateIntervalChange,
        onThemeModeChange: handleThemeModeChange,
        onDisplayModeChange: handleDisplayModeChange,
        onResetTimerDisplayModeChange: handleResetTimerDisplayModeChange,
        onResetTimerDisplayModeToggle: handleResetTimerDisplayModeToggle,
        onMenubarIconStyleChange: handleMenubarIconStyleChange,
        traySettingsPreview,
        onGlobalShortcutChange: handleGlobalShortcutChange,
        onStartOnLoginChange: handleStartOnLoginChange,
        accountOptionsByPlugin,
        selectedAccountByPlugin,
        onAccountChange: handleAccountSelectionChange,
        cliProxyConfigured,
        cliProxyBaseUrl,
        cliProxyApiKey,
        cliProxyAuthFileCount: cliProxyAuthFiles.length,
        cliProxyBusy,
        cliProxyError,
        onCliProxyBaseUrlChange: setCliProxyBaseUrl,
        onCliProxyApiKeyChange: setCliProxyApiKey,
        onCliProxySave: () => {
          void handleCliProxySave()
        },
        onCliProxyRefresh: () => {
          void handleCliProxyRefresh()
        },
        onCliProxyClear: () => {
          void handleCliProxyClear()
        },
      }}
    />
  )
}

export { App }
