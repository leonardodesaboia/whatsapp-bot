import SettingsSidebar from '@/components/SettingsSidebar';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <SettingsSidebar />
      <div className="ml-[180px] flex-1 min-w-0 bg-slate-50">
        {children}
      </div>
    </div>
  );
}
