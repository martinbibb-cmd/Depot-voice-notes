function normaliseList(values = []) {
  return values.map((v) => (v || "").trim()).filter(Boolean);
}

function buildAllowanceTable(session) {
  if (!session.allowances) return undefined;
  const rows = [];

  (session.allowances.charges || []).forEach((line) => {
    rows.push([line.label, line.amount ?? "", line.notes || ""]);
  });

  (session.allowances.discounts || []).forEach((line) => {
    const label = line.label.toLowerCase().includes("discount")
      ? line.label
      : `${line.label} (discount)`;
    rows.push([label, line.amount ?? "", line.notes || ""]);
  });

  if (!rows.length) return undefined;

  return {
    title: "Allowances",
    headers: ["Description", "Amount", "Notes"],
    rows
  };
}

function buildMaterialsTable(session) {
  if (!session.materials || session.materials.length === 0) return undefined;
  return {
    title: "Materials",
    headers: ["Category", "Item", "Qty", "Notes"],
    rows: session.materials.map((item) => [
      item.category || "General",
      item.item,
      item.qty ?? "",
      item.notes || ""
    ])
  };
}

function buildHeatLossSection(session) {
  if (!session.heatLoss) return undefined;
  const lines = [];
  if (session.heatLoss.totalHeatLossKw) {
    lines.push(`Calculated heat loss: ${session.heatLoss.totalHeatLossKw} kW`);
  }
  if (session.heatLoss.notes) {
    lines.push(session.heatLoss.notes);
  }
  if (session.heatLoss.sections && session.heatLoss.sections.length) {
    session.heatLoss.sections.forEach((s) => {
      const bits = [s.area, s.value ? `${s.value} kW` : null, s.notes]
        .filter(Boolean)
        .join(" – ");
      if (bits) lines.push(bits);
    });
  }

  return {
    title: "Heat loss",
    items: lines
  };
}

function buildCustomerPack(session) {
  const sections = [];

  if (session.vulnerability) {
    sections.push({
      title: "Customer needs",
      items: normaliseList([
        session.vulnerability.reasonForQuotation,
        ...(session.vulnerability.customerNeeds || []),
        session.vulnerability.accessibilityNotes
      ])
    });
  }

  if (session.existingSystem) {
    const items = normaliseList([
      session.existingSystem.systemType
        ? `Existing system: ${session.existingSystem.systemType}`
        : undefined,
      session.existingSystem.boilerLocation
        ? `Boiler location: ${session.existingSystem.boilerLocation}`
        : undefined,
      session.existingSystem.controls && `Controls: ${session.existingSystem.controls}`,
      session.existingSystem.systemHealth && `System health: ${session.existingSystem.systemHealth}`,
      session.existingSystem.homecareStatus && `Homecare: ${session.existingSystem.homecareStatus}`
    ]);
    if (items.length) {
      sections.push({ title: "Existing system", items });
    }
  }

  const heatLossSection = buildHeatLossSection(session);
  if (heatLossSection) sections.push(heatLossSection);

  if (session.installerNotes) {
    const items = normaliseList([
      session.installerNotes.disruptionLevel && `Disruption: ${session.installerNotes.disruptionLevel}`,
      ...(session.installerNotes.customerConcerns || []),
      session.installerNotes.safetyNotes,
      session.installerNotes.otherNotes
    ]);
    if (items.length) {
      sections.push({ title: "Installer notes", items });
    }
  }

  const aiSummary = session.ai?.customerSummary || session.ai?.customerPack;
  if (aiSummary) {
    sections.push({
      title: "AI summary",
      body: aiSummary
    });
  }

  const tables = [];
  const materialsTable = buildMaterialsTable(session);
  if (materialsTable) tables.push(materialsTable);
  const allowanceTable = buildAllowanceTable(session);
  if (allowanceTable) tables.push(allowanceTable);

  return {
    title: `Customer pack${session.meta?.customerName ? ` – ${session.meta.customerName}` : ""}`,
    sections,
    tables
  };
}

function buildInstallerPack(session) {
  const sections = [];

  if (session.existingSystem) {
    sections.push({
      title: "Existing system",
      items: normaliseList([
        session.existingSystem.systemType && `System: ${session.existingSystem.systemType}`,
        session.existingSystem.boilerLocation && `Boiler location: ${session.existingSystem.boilerLocation}`,
        session.existingSystem.controls && `Controls: ${session.existingSystem.controls}`,
        ...(session.existingSystem.issues || [])
      ])
    });
  }

  if (session.boilerJob) {
    sections.push({
      title: "Boiler job",
      items: normaliseList([
        session.boilerJob.type && `Job type: ${session.boilerJob.type}`,
        session.boilerJob.boilerLocation && `Location: ${session.boilerJob.boilerLocation}`,
        session.boilerJob.flueType && `Flue: ${session.boilerJob.flueType}`,
        session.boilerJob.controls && `Controls: ${session.boilerJob.controls}`,
        session.boilerJob.notes
      ])
    });
  }

  if (session.cleansing) {
    sections.push({
      title: "Cleansing & protection",
      items: normaliseList([
        session.cleansing.cleansingRequired && `Cleansing: ${session.cleansing.cleansingRequired}`,
        session.cleansing.inhibitorRequired && `Inhibitor: ${session.cleansing.inhibitorRequired}`,
        session.cleansing.magneticFilter && `Magnetic filter: ${session.cleansing.magneticFilter}`,
        session.cleansing.notes
      ])
    });
  }

  if (session.waterSystem) {
    sections.push({
      title: "Water system",
      items: normaliseList([
        session.waterSystem.mainsPressure && `Mains pressure: ${session.waterSystem.mainsPressure}`,
        session.waterSystem.flowRate && `Flow rate: ${session.waterSystem.flowRate}`,
        session.waterSystem.stopTapLocation && `Stop tap: ${session.waterSystem.stopTapLocation}`,
        session.waterSystem.waterQualityNotes
      ])
    });
  }

  if (session.electrical || session.workingAtHeight || session.asbestos) {
    const safetyItems = [];
    if (session.electrical) {
      safetyItems.push(
        ...normaliseList([
          session.electrical.hasSpur && `Fused spur: ${session.electrical.hasSpur}`,
          session.electrical.consumerUnitLocation && `CU location: ${session.electrical.consumerUnitLocation}`,
          session.electrical.bondingStatus && `Bonding: ${session.electrical.bondingStatus}`,
          session.electrical.notes
        ])
      );
    }
    if (session.workingAtHeight) {
      safetyItems.push(
        ...normaliseList([
          session.workingAtHeight.loftAccess && `Loft access: ${session.workingAtHeight.loftAccess}`,
          session.workingAtHeight.ladderHeight && `Ladder height: ${session.workingAtHeight.ladderHeight}`,
          session.workingAtHeight.roofType && `Roof type: ${session.workingAtHeight.roofType}`,
          session.workingAtHeight.scaffoldingRequired &&
            `Scaffolding: ${session.workingAtHeight.scaffoldingRequired}`,
          session.workingAtHeight.notes
        ])
      );
    }
    if (session.asbestos) {
      safetyItems.push(
        ...normaliseList([
          session.asbestos.asbestosRisk && `Asbestos risk: ${session.asbestos.asbestosRisk}`,
          session.asbestos.surveyCompleted && `Survey done: ${session.asbestos.surveyCompleted}`,
          session.asbestos.containmentRequired && `Containment: ${session.asbestos.containmentRequired}`,
          session.asbestos.notes
        ])
      );
    }

    if (safetyItems.length) {
      sections.push({ title: "Safety & access", items: safetyItems });
    }
  }

  const heatLossSection = buildHeatLossSection(session);
  if (heatLossSection) sections.push(heatLossSection);

  if (session.stores && session.stores.length) {
    sections.push({
      title: "Stores",
      items: session.stores
        .map((store) => normaliseList([store.location, store.size, store.notes]).join(" – "))
        .filter(Boolean)
    });
  }

  if (session.cylinders && session.cylinders.length) {
    sections.push({
      title: "Cylinders",
      items: session.cylinders
        .map((cyl) => normaliseList([cyl.location, cyl.volume, cyl.coilType, cyl.notes]).join(" – "))
        .filter(Boolean)
    });
  }

  if (session.radiators && session.radiators.length) {
    sections.push({
      title: "Radiators",
      items: session.radiators
        .map((rad) => normaliseList([rad.room, rad.size, rad.type, rad.notes]).join(" – "))
        .filter(Boolean)
    });
  }

  if (session.installerNotes) {
    const items = normaliseList([
      session.installerNotes.sequencingNotes,
      session.installerNotes.otherNotes
    ]);
    if (items.length) sections.push({ title: "Install notes", items });
  }

  const materialsTable = buildMaterialsTable(session);
  const tables = materialsTable ? [materialsTable] : [];

  return {
    title: `Installer pack${session.meta?.sessionName ? ` – ${session.meta.sessionName}` : ""}`,
    sections,
    tables
  };
}

function buildOfficePack(session) {
  const sections = [];

  const metaLines = normaliseList([
    session.meta?.sessionName && `Session: ${session.meta.sessionName}`,
    session.meta?.adviser && `Adviser: ${session.meta.adviser}`,
    session.meta?.createdAt && `Created: ${session.meta.createdAt}`,
    session.meta?.jobType && `Job type: ${session.meta.jobType}`,
    session.meta?.source && `Source: ${session.meta.source}`
  ]);
  if (metaLines.length) {
    sections.push({ title: "Session info", items: metaLines });
  }

  if (session.vulnerability) {
    sections.push({
      title: "Vulnerability",
      items: normaliseList([
        session.vulnerability.reasonForQuotation,
        session.vulnerability.urgency && `Urgency: ${session.vulnerability.urgency}`,
        session.vulnerability.accessibilityNotes
      ])
    });
  }

  if (session.allowances) {
    const allowanceLines = normaliseList([
      session.allowances.subtotal !== undefined
        ? `Subtotal: £${session.allowances.subtotal}`
        : undefined,
      ...(session.allowances.charges || []).map((c) => `${c.label}${c.amount ? ` £${c.amount}` : ""}`),
      ...(session.allowances.discounts || []).map((d) => `${d.label}${d.amount ? ` (£${d.amount})` : ""}`)
    ]);
    if (allowanceLines.length) {
      sections.push({ title: "Allowances", items: allowanceLines });
    }
  }

  if (session.asbestos) {
    sections.push({
      title: "Asbestos & safety",
      items: normaliseList([
        session.asbestos.asbestosRisk && `Risk: ${session.asbestos.asbestosRisk}`,
        session.asbestos.surveyCompleted && `Survey: ${session.asbestos.surveyCompleted}`,
        session.asbestos.notes
      ])
    });
  }

  if (session.workingAtHeight) {
    sections.push({
      title: "Working at height",
      items: normaliseList([
        session.workingAtHeight.loftAccess && `Loft access: ${session.workingAtHeight.loftAccess}`,
        session.workingAtHeight.scaffoldingRequired &&
          `Scaffolding: ${session.workingAtHeight.scaffoldingRequired}`,
        session.workingAtHeight.notes
      ])
    });
  }

  if (session.ai?.officeNotes) {
    sections.push({ title: "AI office notes", body: session.ai.officeNotes });
  }

  const tables = [];
  const allowanceTable = buildAllowanceTable(session);
  if (allowanceTable) tables.push(allowanceTable);

  return {
    title: `Office pack${session.meta?.sessionName ? ` – ${session.meta.sessionName}` : ""}`,
    sections,
    tables
  };
}

export function buildPresentation(session) {
  return {
    customerPack: buildCustomerPack(session),
    installerPack: buildInstallerPack(session),
    officePack: buildOfficePack(session)
  };
}

export default buildPresentation;
