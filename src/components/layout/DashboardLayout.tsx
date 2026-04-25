/**
 * DashboardLayout — Shared layout for all authenticated pages
 *
 * Provides a persistent sidebar navigation + top bar. Uses the shadcn/ui
 * Sidebar primitives already installed at @/components/ui/sidebar.
 */
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Settings,
  LogOut,
  User,
  PanelLeft,
  GraduationCap,
  LayoutDashboard,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarInset,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { LampToggle } from '@/components/ui/lamp-toggle';

// ── Menu definitions ─────────────────────────────────────────────────────────

const BOTTOM_NAV = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Profile', icon: User, path: '/profile' },
  { label: 'Settings', icon: Settings, path: '/settings' },
] as const;

// ── Sidebar content ──────────────────────────────────────────────────────────

function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <Sidebar collapsible="icon" className="border-r border-border/40">
      {/* Brand header */}
      <SidebarHeader className="px-4 py-4">
        <Link to="/dashboard" className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <GraduationCap size={18} className="text-primary" />
          </div>
          <span className="text-lg font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            Openclass_learner
          </span>
        </Link>
      </SidebarHeader>

      <Separator className="opacity-30" />

      {/* Footer — profile, settings, logout */}
      <SidebarFooter className="px-2 pb-3 mt-auto">
        <Separator className="opacity-30 mb-2" />

        <SidebarMenu>
          {BOTTOM_NAV.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.label}
                  className={cn(
                    'transition-colors',
                    isActive && 'bg-primary/10 text-primary font-medium',
                  )}
                >
                  <Link to={item.path}>
                    <item.icon size={18} />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}

          {/* Logout */}
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sign out"
              onClick={logout}
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <LogOut size={18} />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* User mini-card */}
        <div className="mt-3 mx-2 flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
            {user?.preferredName?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="text-sm font-medium truncate">{user?.preferredName || 'Student'}</div>
            <div className="text-[10px] text-muted-foreground truncate">
              {user?.grade || 'No grade'}
            </div>
          </div>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

// ── Top bar (inside SidebarInset) ────────────────────────────────────────────

function TopBar() {
  const location = useLocation();

  // Derive a page title from the current path
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/dashboard') return 'Dashboard';
    if (path === '/profile') return 'Profile';
    if (path === '/settings') return 'Settings';
    if (path.startsWith('/classroom/')) return 'Classroom';
    return 'Openclass Learner';
  };

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <h1 className="text-lg font-semibold">{getPageTitle()}</h1>
      <div className="ml-auto">
        <LampToggle />
      </div>
    </header>
  );
}

// ── Sidebar trigger (for mobile) ─────────────────────────────────────────────

function SidebarTrigger() {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      onClick={toggleSidebar}
      className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10"
    >
      <PanelLeft size={18} />
      <span className="sr-only">Toggle Sidebar</span>
    </button>
  );
}

// ── Main layout ──────────────────────────────────────────────────────────────

export default function DashboardLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <TopBar />
        <div className="flex flex-1 flex-col gap-4 p-4">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}