import { PersonalizeDialog } from "./PersonalizeDialog";
import { Avatar as ProfileAvatar } from "./Avatar";
import { useExperience } from "@/lib/experience-context";
import { Home, Palette, Building2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

import { useAuth } from "@/lib/auth";
import isotipo from "@/assets/brand/isotipo.svg";
import logotipo from "@/assets/brand/logotipo.svg";

export function TopBar() {
  const { firebaseUser, signOut } = useAuth();
  const experience = useExperience();
  const [personalizeOpen, setPersonalizeOpen] = useState(false);
  const displayName =
    experience.profile?.name || firebaseUser?.displayName || firebaseUser?.email || "User";
  const email = firebaseUser?.email || "";
  const photoUrl = experience.profile?.photoUrl ?? firebaseUser?.photoURL ?? undefined;
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
        <Link to="/" aria-label="Platformance home" className="group flex items-center gap-2">
          <img ref={isotipoRef} src={isotipo} alt="" className="h-7 w-7 shrink-0" />
          <img
            ref={logotipoRef}
            src={logotipo}
            alt=""
            className={`h-7 w-auto shrink-0 dark:invert sm:block ${showMobileLogotipo ? "block" : "hidden"}`}
          />
        </Link>
        <div ref={rightSectionRef} className="flex items-center gap-2">
          <Link
            to={experience.organizationId ? "/organizations/$organizationId" : "/"}
            params={experience.organizationId ? { organizationId: experience.organizationId } : {}}
            className="rounded-lg p-2 hover:bg-muted"
            aria-label="Your home"
          >
            <Home className="h-4 w-4" />
          </Link>
          <Link
            to="/organizations"
            className="rounded-lg p-2 hover:bg-muted"
            aria-label="Organizations"
          >
            <Building2 className="h-4 w-4" />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Personalize"
            title="Personalize"
            onClick={() => setPersonalizeOpen(true)}
          >
            <Palette className="h-4 w-4" />
          </Button>
          <div className="hidden items-center gap-2 rounded-md px-2 py-1 sm:flex">
            <ProfileAvatar name={displayName} src={photoUrl} size="sm" />
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
      <PersonalizeDialog open={personalizeOpen} onOpenChange={setPersonalizeOpen} />
    </header>
  );
}
