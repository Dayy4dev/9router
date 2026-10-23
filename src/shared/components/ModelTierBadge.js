import PropTypes from "prop-types";
import { resolveModelTier } from "@/shared/utils/modelTier";

export default function ModelTierBadge({ model, providerId, isFree, className = "" }) {
  const tier = resolveModelTier(model, providerId, isFree);

  if (tier === "free") {
    return (
      <span
        title="Model Gratis (Free Tier)"
        className={`shrink-0 inline-flex items-center gap-1 text-[9px] font-bold tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded leading-none align-middle ${className}`}
      >
        <span className="material-symbols-outlined text-[11px] leading-none select-none">sell</span>
        FREE
      </span>
    );
  }

  if (tier === "paid") {
    return (
      <span
        title="Model Berbayar (Paid Tier)"
        className={`shrink-0 inline-flex items-center gap-1 text-[9px] font-semibold tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded leading-none align-middle ${className}`}
      >
        <span className="material-symbols-outlined text-[11px] leading-none select-none">payments</span>
        PAID
      </span>
    );
  }

  return (
    <span
      title="Status Belum Diketahui (Unknown Tier)"
      className={`shrink-0 inline-flex items-center gap-1 text-[9px] font-medium tracking-wider text-text-muted bg-sidebar border border-border px-1.5 py-0.5 rounded leading-none align-middle ${className}`}
    >
      <span className="material-symbols-outlined text-[11px] leading-none select-none">help_outline</span>
      UNKNOWN
    </span>
  );
}

ModelTierBadge.propTypes = {
  model: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
  providerId: PropTypes.string,
  isFree: PropTypes.bool,
  className: PropTypes.string,
};
