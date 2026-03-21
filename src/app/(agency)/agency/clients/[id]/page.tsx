"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import {
  Building2, Globe, FolderKanban, Palette, ArrowLeft,
  Plus, Calendar, ExternalLink, Clock, Pencil,
} from "lucide-react";
import { MOCK_BRAND_ASSETS, ClientStatus } from "@/lib/agency/mock-data";
import { useAgencyStore } from "@/lib/agency/store";
import { Badge } from "@/components/agency/ui/Badge";
import { Modal, FIELD_LABEL, INPUT_CLS, SELECT_CLS } from "@/components/agency/ui/Modal";
import Link from "next/link";

const STAGE_META: Record<string, { label: string; color: string }> = {
  briefing:   { label: "Briefing",   color: "#A1A1AA" },
  diagnosis:  { label: "Diagnosis",  color: "#D97706" },
  planning:   { label: "Planning",   color: "#3B82F6" },
  production: { label: "Production", color: "#8B5CF6" },
  review:     { label: "Review",     color: "#F97316" },
  delivery:   { label: "Delivery",   color: "#0D9488" },
  ongoing:    { label: "Ongoing",    color: "#16A34A" },
  completed:  { label: "Completed",  color: "#A1A1AA" },
};

const ASSET_TYPE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  logo:             { label: "Logo",           bg: "#EEEEFD", text: "#5B5BD6" },
  color_palette:    { label: "Color Palette",  bg: "#FFF7ED", text: "#C2410C" },
  typography:       { label: "Typography",     bg: "#F0FDF4", text: "#15803D" },
  tone_of_voice:    { label: "Tone of Voice",  bg: "#FEF9C3", text: "#A16207" },
  visual_reference: { label: "Visual Ref",     bg: "#F3E8FF", text: "#6D28D9" },
  guideline:        { label: "Guideline",      bg: "#F4F4F5", text: "#52525B" },
};

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  const { clients, projects: storeProjects, updateClient } = useAgencyStore();

  const clientData = clients.find((c) => c.id === params.id);
  if (!clientData) notFound();
  const client = clientData!;

  const projects = storeProjects.filter((p) => p.clientId === client.id);
  const assets   = MOCK_BRAND_ASSETS.filter((a) => a.clientId === client.id);
  const active   = projects.filter((p) => p.status === "active").length;

  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    name:        client.name,
    industry:    client.industry,
    status:      client.status as ClientStatus,
    website:     client.website ?? "",
    description: client.description,
  });

  function openEdit() {
    setEditForm({
      name:        client.name,
      industry:    client.industry,
      status:      client.status,
      website:     client.website ?? "",
      description: client.description,
    });
    setShowEdit(true);
  }

  function handleSaveClient() {
    updateClient(client.id, {
      name:        editForm.name.trim() || client.name,
      industry:    editForm.industry.trim() || client.industry,
      status:      editForm.status,
      website:     editForm.website.trim() || undefined,
      description: editForm.description.trim() || client.description,
    });
    setShowEdit(false);
  }

  return (
    <div className="min-h-full" style={{ backgroundColor: "#F5F5F3" }}>
      {/* ── Client Header ─────────────────────────────────────────────── */}
      <div className="border-b border-[#E5E5E2] bg-white px-8 py-5">
        <Link
          href="/agency/clients"
          className="mb-4 flex items-center gap-1.5 text-[11px] font-medium text-[#A1A1AA] transition-colors hover:text-[#52525B]"
        >
          <ArrowLeft size={12} />
          Clients
        </Link>

        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <div
              className="flex h-12 w-12 flex-none items-center justify-center rounded-xl text-[18px] font-bold"
              style={{ backgroundColor: "#F4F4F5", color: "#52525B" }}
            >
              {client.name[0]}
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2.5">
                <h1 className="text-[20px] font-bold text-[#0A0A0A]" style={{ letterSpacing: "-0.02em" }}>
                  {client.name}
                </h1>
                <Badge variant={client.status} />
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[12px] text-[#71717A]">
                <span className="flex items-center gap-1.5">
                  <Building2 size={11} /> {client.industry}
                </span>
                {client.website && (
                  <a href={`https://${client.website}`} className="flex items-center gap-1.5 text-[#5B5BD6] hover:underline">
                    <Globe size={11} /> {client.website}
                    <ExternalLink size={10} />
                  </a>
                )}
                <span className="flex items-center gap-1.5">
                  <Calendar size={11} /> Since {client.createdAt.split("-")[0]}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-none gap-2">
            <button
              onClick={openEdit}
              className="flex items-center gap-1.5 rounded-lg border border-[#E5E5E2] bg-white px-3.5 py-2 text-[12px] font-medium text-[#52525B] transition-colors hover:border-[#D0D0CC]"
            >
              <Pencil size={12} /> Edit Client
            </button>
            <Link
              href="/agency/orchestrator"
              className="flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4848C2]"
            >
              <Plus size={13} /> New Project
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5 px-8 py-6">

        {/* ── Main: About + Projects ───────────────────────────────── */}
        <div className="col-span-2 space-y-5">
          {/* About */}
          <div
            className="rounded-xl border border-[#E5E5E2] bg-white p-5"
            style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
          >
            <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#A1A1AA]">About</h2>
            <p className="text-[13px] leading-relaxed text-[#52525B]">{client.description}</p>
          </div>

          {/* Projects */}
          <div
            className="overflow-hidden rounded-xl border border-[#E5E5E2] bg-white"
            style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
          >
            <div className="flex items-center justify-between border-b border-[#F0F0EE] px-5 py-4">
              <div className="flex items-center gap-2">
                <FolderKanban size={14} className="text-[#5B5BD6]" />
                <h2 className="text-[13px] font-semibold text-[#0A0A0A]">Projects</h2>
                <span className="rounded-full bg-[#F4F4F5] px-2 py-0.5 text-[11px] font-semibold text-[#A1A1AA]">
                  {projects.length}
                </span>
              </div>
              <Link
                href="/agency/orchestrator"
                className="flex items-center gap-1 text-[11px] font-medium text-[#5B5BD6] hover:underline"
              >
                <Plus size={11} /> New project
              </Link>
            </div>

            {projects.length > 0 && (
              <div className="grid grid-cols-12 border-b border-[#F0F0EE] bg-[#FAFAF9] px-5 py-2.5">
                {[
                  { label: "Project",  span: "col-span-5" },
                  { label: "Stage",    span: "col-span-3" },
                  { label: "Priority", span: "col-span-2" },
                  { label: "Due",      span: "col-span-2" },
                ].map((col) => (
                  <div key={col.label} className={`${col.span} text-[10px] font-semibold uppercase tracking-[0.07em] text-[#A1A1AA]`}>
                    {col.label}
                  </div>
                ))}
              </div>
            )}

            {projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14">
                <FolderKanban size={22} className="mb-3 text-[#E5E5E2]" />
                <p className="text-[13px] font-medium text-[#52525B]">No projects yet</p>
                <p className="mt-1 text-[11px] text-[#A1A1AA]">Create the first project for {client.name} via the Orchestrator.</p>
                <Link
                  href="/agency/orchestrator"
                  className="mt-4 flex items-center gap-1.5 rounded-lg bg-[#5B5BD6] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4848C2]"
                >
                  <Plus size={12} /> Start with Orchestrator
                </Link>
              </div>
            ) : (
              <div>
                {projects.map((project, i) => {
                  const stage = STAGE_META[project.stage] ?? { label: project.stage, color: "#A1A1AA" };
                  return (
                    <Link
                      key={project.id}
                      href={`/agency/projects/${project.id}`}
                      className="group grid grid-cols-12 items-center px-5 py-4 transition-colors hover:bg-[#FAFAF9]"
                      style={{ borderBottom: i < projects.length - 1 ? "1px solid #F5F5F3" : "none" }}
                    >
                      <div className="col-span-5 min-w-0 pr-4">
                        <p className="truncate text-[13px] font-semibold text-[#0A0A0A] transition-colors group-hover:text-[#5B5BD6]">
                          {project.name}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-[#A1A1AA]">{project.goal}</p>
                      </div>
                      <div className="col-span-3">
                        <span className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: stage.color }}>
                          <span className="h-[5px] w-[5px] flex-none rounded-full" style={{ backgroundColor: stage.color }} />
                          {stage.label}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <Badge variant={project.priority} />
                      </div>
                      <div className="col-span-2 mono-num flex items-center gap-1 text-[11px] text-[#A1A1AA]">
                        <Clock size={10} />
                        {project.deadline.slice(5)}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Sidebar: Stats + Brand Assets ─────────────────────────── */}
        <div className="space-y-5">
          <div
            className="rounded-xl border border-[#E5E5E2] bg-white"
            style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
          >
            <div className="border-b border-[#F0F0EE] px-5 py-3.5">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#A1A1AA]">At a Glance</h2>
            </div>
            <div className="px-5 py-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Active Projects", value: active,           accent: true },
                  { label: "Total Projects",  value: projects.length               },
                  { label: "Brand Assets",    value: assets.length                 },
                  { label: "Client since",    value: client.createdAt.split("-")[0] },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-lg p-3"
                    style={{ backgroundColor: stat.accent ? "#EEEEFD" : "#FAFAF9" }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: stat.accent ? "#5B5BD6" : "#A1A1AA" }}>
                      {stat.label}
                    </p>
                    <p
                      className="mono-num mt-1 text-[20px] font-bold"
                      style={{ color: stat.accent ? "#5B5BD6" : "#0A0A0A", letterSpacing: "-0.02em" }}
                    >
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Brand Assets */}
          <div
            className="overflow-hidden rounded-xl border border-[#E5E5E2] bg-white"
            style={{ boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)" }}
          >
            <div className="flex items-center justify-between border-b border-[#F0F0EE] px-5 py-4">
              <div className="flex items-center gap-2">
                <Palette size={14} className="text-[#EA580C]" />
                <h2 className="text-[13px] font-semibold text-[#0A0A0A]">Brand Assets</h2>
              </div>
              <button className="flex items-center gap-1 text-[11px] font-medium text-[#5B5BD6] hover:underline">
                <Plus size={11} /> Upload
              </button>
            </div>

            {assets.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-5 py-10">
                <Palette size={22} className="mb-3 text-[#E5E5E2]" />
                <p className="text-[12px] font-medium text-[#52525B]">No brand assets yet</p>
                <p className="mt-0.5 text-center text-[11px] text-[#A1A1AA]">
                  Upload logos, colors, and brand guidelines for {client.name}.
                </p>
              </div>
            ) : (
              <div>
                {assets.map((asset, i) => {
                  const typeConf = ASSET_TYPE_CONFIG[asset.type] ?? ASSET_TYPE_CONFIG["guideline"]!;
                  return (
                    <div
                      key={asset.id}
                      className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-[#FAFAF9]"
                      style={{ borderBottom: i < assets.length - 1 ? "1px solid #F5F5F3" : "none" }}
                    >
                      <div
                        className="flex h-8 w-8 flex-none items-center justify-center rounded-lg"
                        style={{ backgroundColor: typeConf.bg }}
                      >
                        <Palette size={12} style={{ color: typeConf.text }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-medium text-[#0A0A0A]">{asset.name}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span
                            className="inline-flex rounded-[4px] px-[5px] py-[1px] text-[10px] font-semibold"
                            style={{ backgroundColor: typeConf.bg, color: typeConf.text }}
                          >
                            {typeConf.label}
                          </span>
                        </div>
                        {asset.description && (
                          <p className="mt-0.5 truncate text-[11px] text-[#A1A1AA]">{asset.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Edit Client Modal ──────────────────────────────────────── */}
      <Modal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="Edit Client"
        subtitle={client.name}
      >
        <div className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={FIELD_LABEL}>Client Name</label>
              <input
                className={INPUT_CLS}
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div>
              <label className={FIELD_LABEL}>Industry</label>
              <input
                className={INPUT_CLS}
                value={editForm.industry}
                onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
              />
            </div>
            <div>
              <label className={FIELD_LABEL}>Status</label>
              <select
                className={SELECT_CLS}
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as ClientStatus })}
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
                value={editForm.website}
                onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className={FIELD_LABEL}>Description</label>
              <textarea
                rows={3}
                className={`${INPUT_CLS} resize-none`}
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-[#F0F0EE] px-6 py-4">
          <button
            onClick={() => setShowEdit(false)}
            className="rounded-lg border border-[#E5E5E2] px-4 py-2 text-[12px] font-medium text-[#52525B] transition-colors hover:border-[#D0D0CC]"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveClient}
            className="rounded-lg bg-[#5B5BD6] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#4848C2]"
          >
            Save Changes
          </button>
        </div>
      </Modal>
    </div>
  );
}
