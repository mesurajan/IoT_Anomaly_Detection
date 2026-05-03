import { toast } from "sonner";

type AdminAction = "create" | "update" | "delete" | "promote";

type ConfirmAdminActionOptions = {
  action: AdminAction;
  target: string;
  description?: string;
  onConfirm: () => void | Promise<void>;
};

const ACTION_LABELS: Record<AdminAction, string> = {
  create: "Create",
  update: "Update",
  delete: "Delete",
  promote: "Promote",
};

export function confirmAdminAction({
  action,
  target,
  description,
  onConfirm,
}: ConfirmAdminActionOptions) {
  const label = ACTION_LABELS[action];

  toast(`Are you sure you want to ${action} ${target}?`, {
    description: description ?? `Admin action required: ${label.toLowerCase()} ${target}.`,
    duration: 10000,
    action: {
      label: "OK",
      onClick: () => {
        void onConfirm();
      },
    },
    cancel: {
      label: "Cancel",
      onClick: () => undefined,
    },
  });
}
