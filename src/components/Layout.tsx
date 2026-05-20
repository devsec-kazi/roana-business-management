import * as React from 'react';
import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  LogOut, 
  Menu, 
  X, 
  User as UserIcon,
  ShoppingBag,
  Bell,
  Settings,
  ShieldCheck,
  History,
  Crown
} from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'dashboard' | 'customers' | 'invoices' | 'history' | 'settings';
  setActiveTab: (tab: 'dashboard' | 'customers' | 'invoices' | 'history' | 'settings') => void;
  onLogout: () => void;
}

interface NavItemProps {
  key?: string | number;
  item: { id: string; label: string; icon: any };
  mobile?: boolean;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  setIsMobileMenuOpen: (open: boolean) => void;
}

const NavItem = ({ item, mobile = false, activeTab, setActiveTab, setIsMobileMenuOpen }: NavItemProps) => {
  const Icon = item.icon;
  const isActive = activeTab === item.id;

  return (
    <button
      onClick={() => {
        setActiveTab(item.id as any);
        if (mobile) setIsMobileMenuOpen(false);
      }}
      className={cn(
        "flex items-center gap-3 px-6 py-4 rounded-2xl transition-all duration-300 group mb-2",
        isActive 
          ? "bg-primary text-primary-foreground shadow-xl shadow-primary/20 scale-[1.02]" 
          : "text-muted-foreground hover:text-primary hover:bg-primary/5"
      )}
    >
      <Icon className={cn("h-5 w-5 transition-transform group-hover:scale-110", isActive ? "text-primary-foreground" : "text-primary/40")} />
      <span className={cn("text-xs tracking-widest uppercase font-bold", isActive ? "text-primary-foreground" : "")}>{item.label}</span>
    </button>
  );
};

export function Layout({ children, activeTab, setActiveTab, onLogout }: LayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'app'), (doc) => {
      if (doc.exists()) {
        setLogo(doc.data().companyLogo || null);
      }
    });
    return () => unsubscribe();
  }, []);

  const menuItems = [
    { id: 'dashboard', label: 'Admin Panel', icon: LayoutDashboard },
    { id: 'customers', label: 'Client Database', icon: Users },
    { id: 'invoices', label: 'Invoice & Memo', icon: FileText },
    { id: 'history', label: 'Invoice History', icon: History },
  ];

  return (
    <div className="flex min-h-screen bg-background font-sans">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-72 bg-white text-foreground border-r border-primary/10 fixed h-full z-20 shadow-[20px_0_40px_-20px_rgba(184,134,11,0.05)]">
        <div className="p-10 flex flex-col items-center gap-4 text-center">
          <div className="h-24 w-24 rounded-[2rem] bg-muted flex items-center justify-center shadow-2xl border-2 border-primary/20 overflow-hidden p-2 group transition-all hover:scale-105">
            {logo ? (
              <img src={logo} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              <Crown className="h-10 w-10 text-primary" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-heading font-bold leading-tight text-primary">Roana</h1>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-black">Management System</p>
          </div>
        </div>

        <nav className="flex-1 px-6 py-6 space-y-3">
          <p className="px-4 text-[10px] uppercase tracking-[0.3em] text-primary/40 font-black mb-6">Operations</p>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={cn(
                  "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 group text-left",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-xl shadow-primary/20 font-bold" 
                    : "text-muted-foreground hover:text-primary hover:bg-primary/5"
                )}
              >
                <Icon className={cn("h-5 w-5 transition-transform group-hover:scale-110", isActive ? "text-primary-foreground" : "text-primary/40")} />
                <span className="text-sm tracking-wide uppercase font-bold">{item.label}</span>
              </button>
            )
          })}
          
          <div className="pt-10">
            <p className="px-4 text-[10px] uppercase tracking-[0.3em] text-primary/40 font-black mb-6">Configuration</p>
            <button 
              onClick={() => setActiveTab('settings')}
              className={cn(
                "w-full flex items-center gap-4 px-5 py-4 transition-all duration-300 rounded-2xl group text-left",
                activeTab === 'settings' 
                  ? "bg-primary text-primary-foreground shadow-xl shadow-primary/20 font-bold" 
                  : "text-muted-foreground hover:text-primary hover:bg-primary/5"
              )}
            >
              <Settings className={cn("h-5 w-5", activeTab === 'settings' ? "text-primary-foreground" : "text-primary/40")} />
              <span className="text-sm tracking-wide uppercase font-bold">Portal Settings</span>
            </button>
          </div>
        </nav>

        <div className="p-8 mt-auto border-t border-primary/5 bg-primary/[0.02] space-y-4">
          <button
            onClick={() => setActiveTab('settings')}
            className={cn(
              "flex items-center gap-3 w-full px-6 py-4 rounded-xl transition-all duration-300 group shadow-sm",
              activeTab === 'settings' 
                ? "bg-primary text-primary-foreground shadow-xl shadow-primary/20" 
                : "text-muted-foreground hover:text-primary hover:bg-white"
            )}
          >
            <Settings className={cn("h-5 w-5", activeTab === 'settings' ? "text-primary-foreground" : "text-primary/30")} />
            <span className="text-[10px] uppercase font-black tracking-[0.2em] leading-none">Global Settings</span>
          </button>

          <div className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-primary/10 shadow-sm">
            <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden">
               <UserIcon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-black truncate text-primary uppercase tracking-tighter">Owner Account</p>
              <p className="text-[10px] text-muted-foreground font-medium truncate italic leading-none">Secure Session</p>
            </div>
            <button 
              onClick={onLogout}
              className="p-2 text-muted-foreground/30 hover:text-destructive transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-20 bg-white text-foreground flex items-center justify-between px-6 z-30 border-b border-primary/10 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center overflow-hidden">
             <Crown className="h-5 w-5 text-primary-foreground" />
          </div>
          <h1 className="text-lg font-heading font-bold text-primary">Roana</h1>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-xl bg-primary/5 text-primary"
        >
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="lg:hidden fixed inset-0 bg-primary z-20 pt-24 px-6 flex flex-col"
          >
            <nav className="space-y-4 flex-1">
              {menuItems.map((item) => (
                <NavItem 
                  key={item.id} 
                  item={item} 
                  mobile 
                  activeTab={activeTab} 
                  setActiveTab={setActiveTab} 
                  setIsMobileMenuOpen={setIsMobileMenuOpen} 
                />
              ))}
            </nav>
            <div className="pb-10 space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5">
                <div className="h-10 w-10 rounded-full bg-primary-foreground/20 flex items-center justify-center overflow-hidden">
                    <UserIcon className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-bold text-primary-foreground">Administrator</p>
                  <p className="text-xs text-primary-foreground/60">System Owner</p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                onClick={onLogout}
                className="w-full justify-start text-primary-foreground/40 hover:text-red-400"
              >
                <LogOut className="mr-3 h-5 w-5" />
                Sign Out
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 lg:ml-72 pt-20 lg:pt-0 min-h-screen">
        <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
