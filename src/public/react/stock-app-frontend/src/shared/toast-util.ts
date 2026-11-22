import { AxiosError } from "axios";
import { Toast } from "primereact/toast";

export const displayError = (
  toast: React.RefObject<Toast | null>,
  err: unknown,
  config?: { life: number },
) => {
  const errorMessage = getMessageFromError(err);
  toast.current?.show({
    severity: "error",
    summary: "Error",
    detail: "Error: " + errorMessage,
    ...config,
  });
};

const getMessageFromError = (err: unknown) => {
  let errorMessage = "";
  if (err instanceof Error) {
    if (err instanceof AxiosError && err?.response?.data?.message) {
      errorMessage = err?.response?.data?.message;
    }
    if (!errorMessage) {
      errorMessage = err.message;
    }
  } else if (typeof err === "string") {
    errorMessage = err;
  } else if (err) {
    errorMessage = "An unknown error occurred";
  } else {
    return "";
  }
  return errorMessage;
};

export const displayErrorWithMessage = (
  toast: React.RefObject<Toast | null>,
  err: unknown,
  message: string,
  config?: { life: number },
) => {
  toast.current?.show({
    severity: "error",
    summary: "Error",
    detail: message + getMessageFromError(err),
    ...config,
  });
};

export const displaySuccess = (
  toast: React.RefObject<Toast | null>,
  message: string,
  config?: { life: number },
) => {
  toast.current?.show({
    severity: "success",
    summary: "Success",
    detail: message,
    ...config,
  });
};
