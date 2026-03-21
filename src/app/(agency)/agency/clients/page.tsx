"use client";

import { useState } from "react";
import { Users, Plus, Globe, FolderKanban } from "lucide-react";
import { PageHeader } from "@/components/agency/ui/PageHeader";
import { Badge } from "@/components/agency/ui/Badge";
import { Modal, FIELD_LABEL, INPUT_CLS, SELECT_CLS } from "@/components/agency/ui/Modal";
import { useAgencyStore, CreateClientPayload } from "@/lib/agency/store";
import { ClientStatus } from "@/lib/agency/mock-data";
import Link from "next/link";

type Filter = "All" | "Active" | "Onboarding" | "Inactive";

const FILTER_MAP: Record<Filter, ClientStatus | null> = {
  All: null, Active: "active", Onboarding: "onboarding", Inactive: "inactive",
};

const BLANK_FORM: CreateClientPayload = {
  name: "", industry: "", status: "active", website: "", description: "",
};

export default function ClientsPage() {
  const { clients, createClient } = useAgencyStore();
  const [filter, setFilter]       = useState<Filter>("All");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]             = useState<CreateClientPayload>(BLANK_FORM);
  const [error, setError]           = useState("");

  const filtered = filter === "All"
    ? clients
    : clients.filter((c) => c.status === FILTER_MAP[filter]);

  function handleCreate() {
    if (!form.name.trim()) { setError("Client name is required."); return; }
    if (!form.industry.trim()) { setError("Industry is required."); return; }
    if (!form.description.trim()) { setError("Description is required."); return; }
    createClient({ ...form, website: form.website?.trim() || undefined });
    setForm(BLANK_FORM);
    setError("");
    setShowCreate(false);
  }

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F5F5F3" }}>
      <div className="px-8 py-7">
        <PageHeader
          title="Clients"
          subtitle={`${filtered.length} of ${clients.length} client${clients.length !== 1 ? "s" : ""}`}
          icon={Users}
        >
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4848C2]"
          >
            <Plus size={13} />
            New Client
          </button>
        </PageHeader>

        {/* Filters */}
        <div className="mb-5 flex items-center gap-1.5">
          {(["All", "Active", "Onboarding", "Inactive"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="rounded-[6px] px-3 py-1.5 text-[12px] font-medium transition-colors"
              style={
                filter === f
                  ? { backgroundColor: "#0A0A0A", color: "#FFFFFF" }
                  : { backgroundColor: "#FFFFFF", color: "#71717A", border: "1px solid #E5E5E2" }
              }
            >
              {f}
            </button>
          ))}
        </div>

        {/* Client cards */}
        <div className="grid grid-cols-3 gap-4">
          {filtered.map((client) => (
            <Link
              key={client.id}
              href={`/agency/clients/${client.id}`}
              className="group block rounded-xl border border-[#E5E5E2] bg-white p-5 transition-all hover:border-[#5B5BD6]"
              style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[#F4F4F5] text-[15px] font-bold text-[#52525B]">
                    {client.name[0]}
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-[#0A0A0A] transition-colors group-hover:text-[#5B5BD6]">
                      {client.name}
                    </p>
                    <p className="text-[11px] text-[#A1A1AA]">{client.industry}</p>
                  </div>
                </div>
                <Badge variant={client.status} />
              </div>
              <p className="mb-4 line-clamp-2 text-[12px] leading-relaxed text-[#71717A]">
                {client.description}
              </p>
              <div className="flex items-center justify-between border-t border-[#F5F5F3] pt-3.5">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <FolderKanban size={11} className="text-[#A1A1AA]" />
                    <span className="text-[12px] font-semibold text-[#0A0A0A]">{client.activeProjects}</span>
                    <span className="text-[11px] text-[#A1A1AA]">active</span>
                  </div>
                  <span className="text-[11px] text-[#C0C0BC]">{client.totalProjects} total</span>
                </div>
                {client.website && (
                  <div className="flex items-center gap-1 text-[11px] text-[#C0C0BC]">
                    <Globe size={10} /> {client.website}
                  </div>
                )}
              </div>
            </Link>
          ))}

          {/* Add placeholder card */}
          <button
            onClick={() => setShowCreate(true)}
            className="group flex flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-[#EAEAE8] py-10 transition-all hover:border-[#5B5BD6] hover:bg-white"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F4F4F5] transition-colors group-hover:bg-[#EEEEFD]">
              <Plus size={18} className="text-[#C0C0BC] transition-colors group-hover:text-[#5B5BD6]" />
            </div>
            <p className="text-[12px] font-medium text-[#C0C0BC] transition-colors group-hover:text-[#5B5BD6]">
              Add new client
            </p>
          </button>
        </div>
      </div>

      {/* ── Create Client Modal ──────────────────────────────────────── */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); setForm(BLANK_FORM); setError(""); }}
        title="New Client"
        subtitle="Add a client to the agency workspace"
      >
        <div className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={FIELD_LABEL}>Client Name *</label>
              <input
                className={INPUT_CLS}
                placeholder="e.g. Santioh"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className={FIELD_LABEL}>Industry *</label>
              <input
                className={INPUT_CLS}
                placeholder="e.g. E-commerce / Fashion"
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
              />
            </div>
            <div>
              <label className={FIELD_LABEL}>Status</label>
              <select
                className={SELECT_CLS}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ClientStatus })}
              >
                <option value="active">Active</option>
                <option value="onboarding">Onboarding</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={FIELD_LABEL}>Website</label>
              <input
                className={INPUT_CLS}
                placeholder="e.g. clientsite.com"
                value={form.website ?? ""}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className={FIELD_LABEL}>Description *</label>
              <textarea
                rows={3}
                className={`${INPUT_CLS} resize-none`}
                placeholder="Brief description of the client's business and goals."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-[#FEF2F2] px-3 py-2 text-[12px] font-medium text-[#DC2626]">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-[#F0F0EE] px-6 py-4">
          <button
            onClick={() => { setShowCreate(false); setForm(BLANK_FORM); setError(""); }}
            className="rounded-lg border border-[#E5E5E2] px-4 py-2 text-[12px] font-medium text-[#52525B] transition-colors hover:border-[#D0D0CC]"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="rounded-lg bg-[#5B5BD6] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4848C2]"
          >
            Create Client
          </button>
        </div>
      </Modal>
    </div>
  );
}
