import { ReactNode } from "react";
import { recordDocumentAccess, VersionParent, AccessAction } from "@/lib/documentVersions";

interface Props {
  href: string;
  parentType: VersionParent;
  parentId: string;
  /** Defaults to 'viewed'. Use 'downloaded' for explicit download buttons. */
  action?: AccessAction;
  /** Called after access is recorded. */
  onTracked?: () => void;
  className?: string;
  title?: string;
  children: ReactNode;
}

/**
 * Anchor wrapper that records who opened/downloaded a PDF before
 * navigating to the file URL in a new tab.
 */
export function TrackedPdfLink({
  href,
  parentType,
  parentId,
  action = "viewed",
  onTracked,
  className,
  title,
  children,
}: Props) {
  const handleClick = () => {
    // Fire-and-forget; do not block navigation.
    recordDocumentAccess({ parentType, parentId, pdfUrl: href, action })
      .then(() => onTracked?.())
      .catch(() => {});
  };
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title={title}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}