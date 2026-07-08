import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiSend } from "@/lib/api";

export function formToObject(form: HTMLFormElement): Record<string, unknown> {
  const fd = new FormData(form);
  const obj: Record<string, unknown> = {};
  fd.forEach((value, key) => {
    obj[key] = value;
  });
  return obj;
}

export function useApiMutation<TResult = unknown>(
  path: string,
  options: { method?: "POST" | "PUT"; onSuccess?: (data: TResult) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => apiSend<TResult>(path, options.method ?? "POST", body),
    onSuccess: async (data) => {
      await qc.invalidateQueries();
      toast.success("Action completed");
      options.onSuccess?.(data);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Action failed");
    },
  });
}
