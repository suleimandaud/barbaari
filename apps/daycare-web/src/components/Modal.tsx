import React from "react";
import { Dialog } from "@barbaari/shared/web/ui";

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <Dialog title={title} onClose={onClose} wide>{children}</Dialog>;
}
