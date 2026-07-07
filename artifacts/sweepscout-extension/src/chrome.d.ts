declare namespace chrome {
  namespace runtime {
    const lastError: { message?: string } | undefined;
    const id: string;
    function sendMessage(message: unknown, responseCallback?: (response: unknown) => void): void;
    const onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: MessageSender,
          sendResponse: (response?: unknown) => void,
        ) => boolean | void,
      ): void;
    };
    type MessageSender = {
      tab?: tabs.Tab;
    };
  }

  namespace tabs {
    type Tab = {
      id?: number;
      url?: string;
      title?: string;
    };
    function query(queryInfo: { active?: boolean; currentWindow?: boolean }, callback: (tabs: Tab[]) => void): void;
    function sendMessage(tabId: number, message: unknown, responseCallback?: (response: unknown) => void): void;
    function create(createProperties: { url: string }): void;
  }

  namespace storage {
    type StorageArea = {
      get(keys?: string | string[] | Record<string, unknown> | null, callback?: (items: Record<string, unknown>) => void): void;
      set(items: Record<string, unknown>, callback?: () => void): void;
      remove(keys: string | string[], callback?: () => void): void;
    };
    const local: StorageArea;
  }
}
