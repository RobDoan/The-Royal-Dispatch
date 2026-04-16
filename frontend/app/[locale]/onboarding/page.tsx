'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  getStoredToken,
  getTokenFromUrl,
  storeToken,
  fetchUserProfile,
  updateUserProfile,
  fetchPersonas,
  type Persona,
  type UserProfile,
} from '@/lib/user';
import { CharactersPicker } from '@/components/CharactersPicker';

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface ChildDraft {
  id: string | null;
  localKey: string;
  name: string;
  favoritePrincesses: string[];
}

interface FormState {
  parentName: string;
  children: ChildDraft[];
}

export default function OnboardingPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('onboarding');

  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ChildDraft | null>(null);

  const [form, setForm] = useState<FormState>({ parentName: '', children: [] });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    async function resolve() {
      let tok = getStoredToken();
      if (!tok) {
        const urlTok = getTokenFromUrl();
        if (urlTok) {
          storeToken(urlTok);
          tok = urlTok;
        }
      }
      if (!tok) {
        setLoading(false);
        return;
      }
      setToken(tok);
      const [p, ps] = await Promise.all([fetchUserProfile(tok), fetchPersonas()]);
      setProfile(p);
      setPersonas(ps);
      if (p) {
        setForm({
          parentName: p.name ?? '',
          children: p.children.map((c) => ({
            id: c.id,
            localKey: c.id,
            name: c.name,
            favoritePrincesses: c.preferences?.favorite_princesses ?? [],
          })),
        });
      }
      setLoading(false);
    }
    resolve();
  }, []);

  const isEdit = profile?.user_id != null;
  const heading = isEdit ? t('headingEdit') : t('headingNew');

  const addChild = useCallback(() => {
    setForm((f) => ({
      ...f,
      children: [
        ...f.children,
        { id: null, localKey: uuid(), name: '', favoritePrincesses: [] },
      ],
    }));
  }, []);

  const removeChildByKey = useCallback((key: string) => {
    setForm((f) => ({ ...f, children: f.children.filter((c) => c.localKey !== key) }));
  }, []);

  const requestRemoveChild = useCallback(
    (child: ChildDraft) => {
      if (child.id === null) {
        removeChildByKey(child.localKey);
      } else {
        setConfirmRemove(child);
      }
    },
    [removeChildByKey],
  );

  const confirmRemoval = useCallback(() => {
    if (confirmRemove) {
      removeChildByKey(confirmRemove.localKey);
      setConfirmRemove(null);
    }
  }, [confirmRemove, removeChildByKey]);

  function updateChild(key: string, patch: Partial<ChildDraft>) {
    setForm((f) => ({
      ...f,
      children: f.children.map((c) => (c.localKey === key ? { ...c, ...patch } : c)),
    }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.parentName.trim()) errs.parentName = t('errParentNameRequired');
    if (form.children.length === 0) errs.children = t('errNoChildren');
    form.children.forEach((c) => {
      if (!c.name.trim()) errs[`child:${c.localKey}`] = t('errChildNameRequired');
    });
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitError(null);
    if (!validate()) return;
    setSubmitting(true);
    const result = await updateUserProfile(token, {
      name: form.parentName.trim(),
      children: form.children.map((c) => ({
        id: c.id,
        name: c.name.trim(),
        preferences: { favorite_princesses: c.favoritePrincesses },
      })),
    });
    setSubmitting(false);
    if (result.error) {
      if (result.error.status === 401) setSubmitError(t('errExpired'));
      else if (result.error.status === 409) setSubmitError(result.error.detail);
      else setSubmitError(result.error.detail || t('errGeneric'));
      return;
    }
    router.push(`/${locale}/pick-child`);
  }

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[var(--color-gold)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="fixed inset-0 flex items-center justify-center px-8 text-center">
        <p className="text-white/70">{t('errExpired')}</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-6 py-10">
      <h1
        className="text-3xl font-black tracking-tight text-white mb-2 text-center"
        style={{ fontFamily: 'var(--font-heading)' }}
      >
        {heading}
      </h1>
      <p className="text-white/50 text-sm font-medium mb-8 text-center">{t('subheading')}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 w-full max-w-md">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-white/80">{t('yourName')}</span>
          <input
            type="text"
            aria-label={t('yourName')}
            value={form.parentName}
            onChange={(e) => setForm((f) => ({ ...f, parentName: e.target.value }))}
            className="glass-card px-4 py-3 text-white rounded-xl outline-none focus:ring-2 focus:ring-[var(--color-gold)]"
          />
          {fieldErrors.parentName && (
            <span className="text-xs text-red-300">{fieldErrors.parentName}</span>
          )}
        </label>

        <div className="flex flex-col gap-4">
          {form.children.map((c) => (
            <div key={c.localKey} className="glass-card p-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-white/80">{t('childName')}</span>
                <input
                  type="text"
                  aria-label={t('childName')}
                  value={c.name}
                  onChange={(e) => updateChild(c.localKey, { name: e.target.value })}
                  className="bg-white/5 border border-white/15 px-3 py-2 rounded-lg text-white outline-none focus:ring-2 focus:ring-[var(--color-gold)]"
                />
                {fieldErrors[`child:${c.localKey}`] && (
                  <span className="text-xs text-red-300">{fieldErrors[`child:${c.localKey}`]}</span>
                )}
              </label>
              <div className="flex flex-col gap-2">
                <span className="text-sm text-white/80">{t('favoriteCharacters')}</span>
                <CharactersPicker
                  personas={personas}
                  value={c.favoritePrincesses}
                  onChange={(next) => updateChild(c.localKey, { favoritePrincesses: next })}
                />
              </div>
              <button
                type="button"
                onClick={() => requestRemoveChild(c)}
                className="text-xs text-red-300 hover:text-red-200 self-end"
              >
                {t('remove')}
              </button>
            </div>
          ))}
          {fieldErrors.children && (
            <span className="text-xs text-red-300">{fieldErrors.children}</span>
          )}
          <button
            type="button"
            onClick={addChild}
            className="glass-card px-4 py-3 text-white/90 rounded-xl hover:glass-card-hover"
          >
            + {t('addChild')}
          </button>
        </div>

        {submitError && (
          <div className="bg-red-500/20 border border-red-500/40 px-4 py-3 rounded-xl text-red-100 text-sm">
            {submitError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="gold-gradient-bg px-6 py-4 rounded-xl text-[#1a0533] font-black disabled:opacity-50"
        >
          {submitting ? t('saving') : t('saveAndContinue')}
        </button>
      </form>

      {confirmRemove && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-50"
        >
          <div className="glass-card p-6 rounded-2xl max-w-sm w-full flex flex-col gap-4">
            <h2 className="text-lg font-bold text-white">{t('confirmRemoveTitle')}</h2>
            <p className="text-sm text-white/80">
              {t('confirmRemoveBody', { name: confirmRemove.name })}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                className="px-4 py-2 rounded-lg text-white/80 hover:text-white"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={confirmRemoval}
                className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-100 hover:bg-red-500/30"
              >
                {t('confirmRemove')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
