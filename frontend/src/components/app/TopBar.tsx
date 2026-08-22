import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import isotipo from "@/assets/brand/isotipo.svg";
import logotipo from "@/assets/brand/logotipo.svg";

function initials(name?: string | null, email?: string | null) {
  const source = name || email || "User";
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function TopBar() {
  const { firebaseUser, signOut } = useAuth();
  const displayName = firebaseUser?.displayName || firebaseUser?.email || "User";
  const email = firebaseUser?.email || "";
  const photoUrl = firebaseUser?.photoURL || undefined;
  const [showMobileLogotipo, setShowMobileLogotipo] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const rightSectionRef = useRef<HTMLDivElement>(null);
  const isotipoRef = useRef<HTMLImageElement>(null);
  const logotipoRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const rightSection = rightSectionRef.current;
    const isotipoEl = isotipoRef.current;
    const logotipoEl = logotipoRef.current;
    if (!container || !rightSection || !isotipoEl || !logotipoEl) return;

    const updateLogoVisibility = () => {
      if (window.innerWidth >= 640) {
        setShowMobileLogotipo(true);
        return;
      }

      const containerWidth = container.getBoundingClientRect().width;
      const rightSectionWidth = rightSection.getBoundingClientRect().width;
      const isoHeight = isotipoEl.getBoundingClientRect().height;
      const isoWidth = isotipoEl.getBoundingClientRect().width;
      const logoWidth =
        logotipoEl.naturalWidth > 0 && logotipoEl.naturalHeight > 0
          ? (logotipoEl.naturalWidth / logotipoEl.naturalHeight) * isoHeight
          : logotipoEl.getBoundingClientRect().width;

      const brandGap = 8;
      const sectionsGap = 16;
      const requiredBrandWidth = isoWidth + brandGap + logoWidth;
      const availableBrandWidth = containerWidth - rightSectionWidth - sectionsGap;

      setShowMobileLogotipo(availableBrandWidth >= requiredBrandWidth);
    };

    updateLogoVisibility();
    const observer = new ResizeObserver(updateLogoVisibility);
    observer.observe(container);
    observer.observe(rightSection);
    logotipoEl.addEventListener("load", updateLogoVisibility);
    window.addEventListener("resize", updateLogoVisibility);

    return () => {
      observer.disconnect();
      logotipoEl.removeEventListener("load", updateLogoVisibility);
      window.removeEventListener("resize", updateLogoVisibility);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur">
      <div
        ref={containerRef}
        className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
      >
        <Link
          to="/organizations"
          aria-label="Performance Agent"
          className="group flex items-center gap-2"
        >
          <img ref={isotipoRef} src={isotipo} alt="" className="h-7 w-7 shrink-0" />
          <img
            ref={logotipoRef}
            src={logotipo}
            alt=""
            className={`h-7 w-auto shrink-0 sm:block ${showMobileLogotipo ? "block" : "hidden"}`}
          />
        </Link>
        <div ref={rightSectionRef} className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-md px-2 py-1 sm:flex">
            <Avatar className="h-7 w-7">
              <AvatarImage src={photoUrl} alt={displayName} />
              <AvatarFallback className="text-xs">{initials(displayName, email)}</AvatarFallback>
            </Avatar>
            <div className="max-w-40 leading-tight">
              <p className="truncate text-xs font-medium">{displayName}</p>
              {email ? <p className="truncate text-[11px] text-muted-foreground">{email}</p> : null}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            title="Sign out"
            aria-label="Sign out"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
