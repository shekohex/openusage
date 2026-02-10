import { useShallow } from "zustand/react/shallow"
import { OverviewPage } from "@/pages/overview"
import { ProviderDetailPage } from "@/pages/provider-detail"
import { SettingsPage } from "@/pages/settings"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import type { SettingsPluginState } from "@/hooks/app/use-settings-plugin-list"
import type { TraySettingsPreview } from "@/hooks/app/use-tray-icon"
import { useAppPreferencesStore } from "@/stores/app-preferences-store"
import { useAppUiStore } from "@/stores/app-ui-store"
import type {
  AutoUpdateIntervalMinutes,
  DisplayMode,
  GlobalShortcut,
  MenubarIconStyle,
  ResetTimerDisplayMode,
  ThemeMode,
} from "@/lib/settings"

type AppContentDerivedProps = {
  displayPlugins: DisplayPluginState[]
  settingsPlugins: SettingsPluginState[]
  selectedPlugin: DisplayPluginState | null
}

export type AppContentActionProps = {
  onRetryPlugin: (id: string) => void
  onReorder: (orderedIds: string[]) => void
  onToggle: (id: string) => void
  onAutoUpdateIntervalChange: (value: AutoUpdateIntervalMinutes) => void
  onThemeModeChange: (mode: ThemeMode) => void
  onDisplayModeChange: (mode: DisplayMode) => void
  onResetTimerDisplayModeChange: (mode: ResetTimerDisplayMode) => void
  onResetTimerDisplayModeToggle: () => void
  onMenubarIconStyleChange: (value: MenubarIconStyle) => void
  traySettingsPreview: TraySettingsPreview
  onGlobalShortcutChange: (value: GlobalShortcut) => void
  onStartOnLoginChange: (value: boolean) => void
  accountOptionsByPlugin: Record<string, Array<{ value: string; label: string }>>
  selectedAccountByPlugin: Record<string, string>
  onAccountChange: (pluginId: string, account: string) => void
  providerIconUrl?: string
  cliProxyConfigured: boolean
  cliProxyBaseUrl: string
  cliProxyApiKey: string
  cliProxyAuthFileCount: number
  cliProxyBusy: boolean
  cliProxyError: string | null
  onCliProxyBaseUrlChange: (value: string) => void
  onCliProxyApiKeyChange: (value: string) => void
  onCliProxySave: () => void
  onCliProxyRefresh: () => void
  onCliProxyClear: () => void
}

export type AppContentProps = AppContentDerivedProps & AppContentActionProps

export function AppContent({
  displayPlugins,
  settingsPlugins,
  selectedPlugin,
  onRetryPlugin,
  onReorder,
  onToggle,
  onAutoUpdateIntervalChange,
  onThemeModeChange,
  onDisplayModeChange,
  onResetTimerDisplayModeChange,
  onResetTimerDisplayModeToggle,
  onMenubarIconStyleChange,
  traySettingsPreview,
  onGlobalShortcutChange,
  onStartOnLoginChange,
  accountOptionsByPlugin,
  selectedAccountByPlugin,
  onAccountChange,
  providerIconUrl,
  cliProxyConfigured,
  cliProxyBaseUrl,
  cliProxyApiKey,
  cliProxyAuthFileCount,
  cliProxyBusy,
  cliProxyError,
  onCliProxyBaseUrlChange,
  onCliProxyApiKeyChange,
  onCliProxySave,
  onCliProxyRefresh,
  onCliProxyClear,
}: AppContentProps) {
  const { activeView } = useAppUiStore(
    useShallow((state) => ({
      activeView: state.activeView,
    }))
  )

  const {
    displayMode,
    resetTimerDisplayMode,
    menubarIconStyle,
    autoUpdateInterval,
    globalShortcut,
    themeMode,
    startOnLogin,
  } = useAppPreferencesStore(
    useShallow((state) => ({
      displayMode: state.displayMode,
      resetTimerDisplayMode: state.resetTimerDisplayMode,
      menubarIconStyle: state.menubarIconStyle,
      autoUpdateInterval: state.autoUpdateInterval,
      globalShortcut: state.globalShortcut,
      themeMode: state.themeMode,
      startOnLogin: state.startOnLogin,
    }))
  )

  if (activeView === "home") {
    return (
      <OverviewPage
        plugins={displayPlugins}
        onRetryPlugin={onRetryPlugin}
        displayMode={displayMode}
        resetTimerDisplayMode={resetTimerDisplayMode}
        onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
        accountOptionsByPlugin={accountOptionsByPlugin}
        selectedAccountByPlugin={selectedAccountByPlugin}
        onAccountChange={onAccountChange}
      />
    )
  }

  if (activeView === "settings") {
    return (
      <SettingsPage
        plugins={settingsPlugins}
        onReorder={onReorder}
        onToggle={onToggle}
        autoUpdateInterval={autoUpdateInterval}
        onAutoUpdateIntervalChange={onAutoUpdateIntervalChange}
        themeMode={themeMode}
        onThemeModeChange={onThemeModeChange}
        displayMode={displayMode}
        onDisplayModeChange={onDisplayModeChange}
        resetTimerDisplayMode={resetTimerDisplayMode}
        onResetTimerDisplayModeChange={onResetTimerDisplayModeChange}
        menubarIconStyle={menubarIconStyle}
        onMenubarIconStyleChange={onMenubarIconStyleChange}
        traySettingsPreview={traySettingsPreview}
        globalShortcut={globalShortcut}
        onGlobalShortcutChange={onGlobalShortcutChange}
        startOnLogin={startOnLogin}
        onStartOnLoginChange={onStartOnLoginChange}
        providerIconUrl={providerIconUrl}
        cliProxyConfigured={cliProxyConfigured}
        cliProxyBaseUrl={cliProxyBaseUrl}
        cliProxyApiKey={cliProxyApiKey}
        cliProxyAuthFileCount={cliProxyAuthFileCount}
        cliProxyBusy={cliProxyBusy}
        cliProxyError={cliProxyError}
        onCliProxyBaseUrlChange={onCliProxyBaseUrlChange}
        onCliProxyApiKeyChange={onCliProxyApiKeyChange}
        onCliProxySave={onCliProxySave}
        onCliProxyRefresh={onCliProxyRefresh}
        onCliProxyClear={onCliProxyClear}
      />
    )
  }

  const handleRetry = selectedPlugin
    ? () => onRetryPlugin(selectedPlugin.meta.id)
    : /* v8 ignore next */ undefined

  return (
    <ProviderDetailPage
      plugin={selectedPlugin}
      onRetry={handleRetry}
      displayMode={displayMode}
      resetTimerDisplayMode={resetTimerDisplayMode}
      onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
      accountOptions={selectedPlugin ? accountOptionsByPlugin[selectedPlugin.meta.id] : undefined}
      selectedAccount={selectedPlugin ? selectedAccountByPlugin[selectedPlugin.meta.id] : undefined}
      onAccountChange={
        selectedPlugin
          ? (account) => onAccountChange(selectedPlugin.meta.id, account)
          : undefined
      }
    />
  )
}
