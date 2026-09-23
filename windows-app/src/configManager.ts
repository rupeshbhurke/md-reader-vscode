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
  readingWidth: 'medium', // Default to medium on Desktop
  blueLightFilter: 0,
  scrollSync: false,
};

export class ConfigManager {
  private config: AppConfig = { ...DEFAULT_CONFIG };

  async load(): Promise<AppConfig> {
    const value = localStorage.getItem('mdreader_config');
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
    localStorage.setItem('mdreader_config', JSON.stringify(this.config));
  }

  async updateSetting<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void> {
    this.config[key] = value;
    await this.save(this.config);
  }
}
