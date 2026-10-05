"use client";

import { useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  useCustomerAuth,
  type AuthModalMode,
} from "@/components/customer/CustomerAuthProvider";
import { useI18n } from "@/lib/i18n";
import { CustomerAuthForm } from "@/app/login/CustomerAuthForm";

/**
 * Modal popup untuk login / register customer.
 *
 * Dipasang di root layout (sekali saja), dikontrol oleh state
 * `authModalOpen` di `CustomerAuthProvider`. Komponen lain (mis.
 * SiteHeader) cukup panggil `openAuthModal("login")` untuk membukanya.
 *
 * Form CustomerAuthForm dipakai ulang — sama persis dengan halaman
 * /login & /register, sehingga:
 * - Validasi (DOB >= 13 tahun, password >= 8 char, dll) konsisten
 * - Error message + i18n sama
 * - Verifikasi email flow ditangani (banner matcha "cek kotak masuk")
 */
export function AuthModal({ nextPath }: { nextPath?: string }) {
  const {
    authModalOpen,
    authModalMode,
    closeAuthModal,
    setAuthModalMode,
  } = useCustomerAuth();
  const { t } = useI18n();

  // Esc sudah di-handle Modal. Tambah: Cmd/Ctrl+Enter submit form.
  useEffect(() => {
    if (!authModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        const form = document.querySelector(
          "[data-auth-modal-form]"
        ) as HTMLFormElement | null;
        if (form) {
          e.preventDefault();
          form.requestSubmit();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [authModalOpen]);

  const title =
    authModalMode === "login" ? t.customerAuth.login.title : t.customerAuth.register.title;

  return (
    <Modal
      open={authModalOpen}
      onClose={closeAuthModal}
      title={title}
      size="md"
    >
      {authModalOpen ? (
        <CustomerAuthForm
          key={authModalMode}
          mode={authModalMode}
          nextPath={nextPath}
          dict={t.customerAuth}
          onSwitchMode={(next) => setAuthModalMode(next as AuthModalMode)}
          onSuccess={closeAuthModal}
          formAttr="data-auth-modal-form"
        />
      ) : null}
    </Modal>
  );
}