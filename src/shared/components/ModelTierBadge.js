import PropTypes from "prop-types";
import { resolveModelTier } from "@/shared/utils/modelTier";

export default function ModelTierBadge({ model, providerId, isFree, className = "" }) {
  const tier = resolveModelTier(model, providerId, isFree);

  if (tier === "free") {
    return (
      <span
        title="Free Tier Model"
        className={`shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold text-green-600 dark:text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded leading-none ${className}`}
      >
        <span className="material-symbols-outlined text-[10px] leading-none">sell</span>
        FREE
      </span>
    );
  }

  if (tier === "paid") {
    return (
      <span
        title="Berbayar (Paid Model)"
        className={`shrink-0 inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded leading-none ${className}`}
      >
        <span className="material-symbols-outlined text-[10px] leading-none">payments</span>
        PAID
      </span>
    );
  }

  return (
    <span
      title="Status Belum Diketahui (Unknown Tier)"
      className={`shrink-0 inline-flex items-center gap-0.5 text-[9px] font-medium text-text-muted bg-sidebar border border-border px-1.5 py-0.5 rounded leading-none ${className}`}
    >
      <span className="material-symbols-outlined text-[10px] leading-none">help_outline</span>
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
