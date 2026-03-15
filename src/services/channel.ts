import { google } from 'googleapis';
import { ChannelParams, ChannelVideosParams } from '../types.js';

/**
 * Service for interacting with YouTube channels
 */
export class ChannelService {
  private youtube;
  private initialized = false;
  private apiKey?: string;
  private allowEnvFallback: boolean;

  constructor(apiKey?: string, allowEnvFallback = true) {
    this.apiKey = apiKey;
    this.allowEnvFallback = allowEnvFallback;
  }

  /**
   * Initialize the YouTube client only when needed
   */
  private initialize() {
    if (this.initialized) return;
    
    const apiKey = this.apiKey || (this.allowEnvFallback ? process.env.YOUTUBE_API_KEY : undefined);
    if (!apiKey) {
      throw new Error('A YouTube API key is required for channel operations.');
    }

    this.youtube = google.youtube({
      version: 'v3',
      auth: apiKey
    });
    
    this.initialized = true;
  }

  /**
   * Get channel details
   */
  async getChannel({ 
    channelId 
  }: ChannelParams): Promise<unknown> {
    try {
      this.initialize();
      
      const response = await this.youtube.channels.list({
        part: ['snippet', 'statistics', 'contentDetails'],
        id: [channelId]
      });

      return response.data.items?.[0] || null;
    } catch (error) {
      throw new Error(`Failed to get channel: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get channel playlists
   */
  async getPlaylists({ 
    channelId, 
    maxResults = 50 
  }: ChannelVideosParams): Promise<unknown[]> {
    try {
      this.initialize();
      
      const response = await this.youtube.playlists.list({
        part: ['snippet', 'contentDetails'],
        channelId,
        maxResults
      });

      return response.data.items || [];
    } catch (error) {
      throw new Error(`Failed to get channel playlists: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get channel videos
   */
  async listVideos({ 
    channelId, 
    maxResults = 50 
  }: ChannelVideosParams): Promise<unknown[]> {
    try {
      this.initialize();
      
      const response = await this.youtube.search.list({
        part: ['snippet'],
        channelId,
        maxResults,
        order: 'date',
        type: ['video']
      });

      return response.data.items || [];
    } catch (error) {
      throw new Error(`Failed to list channel videos: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get channel statistics
   */
  async getStatistics({ 
    channelId 
  }: ChannelParams): Promise<unknown> {
    try {
      this.initialize();
      
      const response = await this.youtube.channels.list({
        part: ['statistics'],
        id: [channelId]
      });

      return response.data.items?.[0]?.statistics || null;
    } catch (error) {
      throw new Error(`Failed to get channel statistics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
