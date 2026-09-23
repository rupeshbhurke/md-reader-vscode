import { Preferences } from '@capacitor/preferences';

export interface AppConfig {
  theme: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  readingWidth: string;
  blueLightFilter: number;
  scrollSync: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  theme: 'auto',
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: 17,
  lineHeight: 1.85,
  readingWidth: 'full', // Full width by default on mobile
  blueLightFilter: 0,
  scrollSync: false,
};

export class ConfigManager {
  private config: AppConfig = { ...DEFAULT_CONFIG };

  async load(): Promise<AppConfig> {
    const { value } = await Preferences.get({ key: 'mdreader_config' });
    if (value) {
      try {
        const stored = JSON.parse(value);
        this.config = { ...DEFAULT_CONFIG, ...stored };
      } catch (e) {
        console.error('Failed to parse config', e);
      }
    }
    return this.config;
  }

  get(): AppConfig {
    return this.config;
  }

  async save(newConfig: Partial<AppConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    await Preferences.set({
      key: 'mdreader_config',
      value: JSON.stringify(this.config),
    });
  }

  async updateSetting<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void> {
    this.config[key] = value;
    await this.save(this.config);
  }
}
