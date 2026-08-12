import { defineStore } from 'pinia';
import { api } from '../api';

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null,
    loading: false,
  }),
  actions: {
    async login(username, password) {
      const res = await api.login(username, password);
      if (res.ok) {
        this.user = res.data.user;
      }
      return res;
    },
    async fetchMe() {
      this.loading = true;
      try {
        const res = await api.me();
        if (res.ok) this.user = res.data.user;
        return res;
      } finally {
        this.loading = false;
      }
    },
    async logout() {
      await api.logout();
      this.user = null;
    },
  },
});
