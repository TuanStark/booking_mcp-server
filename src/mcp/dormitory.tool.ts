import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, Tool } from '@rekog/mcp-nest';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';
import { ReadDbService } from '../data/read-db.service';

@Injectable()
export class DormitoryTool {
  private readonly gatewayUrl: string;
  private readonly googleMapsApiKey?: string;
  private readonly gatewayTimeoutMs: number;
  private readonly logger = new Logger(DormitoryTool.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly readDbService: ReadDbService,
  ) {
    this.gatewayUrl =
      this.configService.get<string>('GATEWAY_URL') || 'http://localhost:4000';
    this.googleMapsApiKey = this.configService.get<string>(
      'GOOGLE_MAPS_API_KEY',
    );
    this.gatewayTimeoutMs = this.configService.get<number>(
      'GATEWAY_TIMEOUT_MS',
      5000,
    );
  }

  private extractErrorMessage(error: any): string {
    return error.response?.data?.message || error.message || 'Unknown error';
  }

  private shouldUseDirectDb(): boolean {
    return this.readDbService.isReady();
  }

  private safeReportProgress(
    context: Context,
    progress: number,
    total = 100,
  ): void {
    try {
      context.reportProgress({ progress, total });
    } catch {
      // stateless transport
    }
  }

  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): string {
    const query = new URLSearchParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          query.append(key, String(value));
        }
      }
    }
    return `${this.gatewayUrl}${path}${query.toString() ? `?${query.toString()}` : ''}`;
  }

  private async getFromGateway(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<any> {
    const url = this.buildUrl(path, params);
    const response = await firstValueFrom(
      this.httpService.get(url, { timeout: this.gatewayTimeoutMs }),
    );
    return response.data;
  }

  private unwrapList(payload: any): any[] {
    if (Array.isArray(payload?.data?.data)) return payload.data.data;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload)) return payload;
    return [];
  }

  private normalizeText(value?: string): string {
    return (value || '').trim().toLowerCase();
  }

  private toNumber(value: any): number | undefined {
    if (value === null || value === undefined) return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }

  private getRoomPrice(room: any): number {
    return this.toNumber(room?.price) ?? 0;
  }

  private getRoomAmenities(room: any): string[] {
    if (!Array.isArray(room?.amenities)) return [];
    return room.amenities
      .map((a: any) => (typeof a === 'string' ? a : a?.name))
      .filter(Boolean)
      .map((v: string) => this.normalizeText(v));
  }

  private parseBuildingCoordinates(building: any): {
    lat?: number;
    lng?: number;
  } {
    return {
      lat: this.toNumber(building?.latitude),
      lng: this.toNumber(building?.longtitude ?? building?.longitude),
    };
  }

  private haversineKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private async fetchAllRooms(): Promise<any[]> {
    return this.readDbService.searchRooms({ limit: 1000 });
  }

  private async fetchAllBuildings(): Promise<any[]> {
    return this.readDbService.searchBuildings({ limit: 500 });
  }

  private async geocodePlaceWithGoogle(
    placeQuery: string,
  ): Promise<{ lat: number; lng: number; formattedAddress?: string }> {
    if (!this.googleMapsApiKey) {
      throw new Error('GOOGLE_MAPS_API_KEY is not configured');
    }
    const response = await firstValueFrom(
      this.httpService.get(
        'https://maps.googleapis.com/maps/api/geocode/json',
        {
          params: {
            address: placeQuery,
            key: this.googleMapsApiKey,
            language: 'vi',
            region: 'vn',
          },
          timeout: this.gatewayTimeoutMs,
        },
      ),
    );
    const payload = response.data;
    if (payload?.status !== 'OK' || !payload?.results?.length) {
      throw new Error(`Geocoding failed: ${payload?.status ?? 'UNKNOWN'}`);
    }
    const loc = payload.results[0]?.geometry?.location;
    const lat = this.toNumber(loc?.lat);
    const lng = this.toNumber(loc?.lng);
    if (lat === undefined || lng === undefined) {
      throw new Error('Invalid coordinates from geocoding');
    }
    return {
      lat,
      lng,
      formattedAddress: payload.results[0]?.formatted_address,
    };
  }

  @Tool({
    name: 'search_rooms',
    description:
      'Tìm kiếm phòng KTX theo tiêu chí kết hợp: giá, sức chứa, loại phòng, tiện nghi, building và trạng thái.',
    parameters: z.object({
      min_price: z.number().optional(),
      max_price: z.number().optional(),
      min_capacity: z.number().int().min(1).optional(),
      max_capacity: z.number().int().optional(),
      room_type: z.string().optional(),
      required_amenities: z.array(z.string()).optional(),
      building_id: z.string().optional(),
      available_only: z.boolean().optional().default(true),
      sort_by: z
        .enum(['price_asc', 'price_desc', 'capacity_asc', 'newest'])
        .optional()
        .default('price_asc'),
      limit: z.number().int().min(1).max(50).optional().default(20),
    }),
  })
  async searchRooms(
    {
      min_price,
      max_price,
      min_capacity,
      max_capacity,
      room_type,
      required_amenities,
      building_id,
      available_only = true,
      sort_by = 'price_asc',
      limit = 20,
    }: {
      min_price?: number;
      max_price?: number;
      min_capacity?: number;
      max_capacity?: number;
      room_type?: string;
      required_amenities?: string[];
      building_id?: string;
      available_only?: boolean;
      sort_by?: 'price_asc' | 'price_desc' | 'capacity_asc' | 'newest';
      limit?: number;
    },
    context: Context,
  ) {
    try {
      this.safeReportProgress(context, 20);
      const rooms = this.shouldUseDirectDb()
        ? await this.readDbService.searchRooms({
            minPrice: min_price,
            maxPrice: max_price,
            minCapacity: min_capacity,
            roomType: room_type,
            buildingId: building_id,
            limit: 1000,
          })
        : this.unwrapList(await this.getFromGateway('/rooms'));

      this.safeReportProgress(context, 70);
      const normalizedType = this.normalizeText(room_type);
      const normalizedAmenities = (required_amenities ?? [])
        .map((a) => this.normalizeText(a))
        .filter(Boolean);

      const filtered = rooms.filter((room) => {
        const price = this.getRoomPrice(room);
        const capacity = this.toNumber(room?.capacity) ?? 0;
        const typeText = this.normalizeText(
          room?.type ?? room?.roomType ?? room?.name,
        );
        const amenities = this.getRoomAmenities(room);
        const status = String(room?.status ?? '').toUpperCase();

        if (min_price !== undefined && price < min_price) return false;
        if (max_price !== undefined && price > max_price) return false;
        if (min_capacity !== undefined && capacity < min_capacity) return false;
        if (max_capacity !== undefined && capacity > max_capacity) return false;
        if (normalizedType && !typeText.includes(normalizedType)) return false;
        if (building_id && room?.buildingId !== building_id) return false;
        if (available_only && status && status !== 'AVAILABLE') return false;
        if (normalizedAmenities.length > 0) {
          if (!normalizedAmenities.every((req) => amenities.includes(req)))
            return false;
        }
        return true;
      });

      const sorted = [...filtered].sort((a, b) => {
        switch (sort_by) {
          case 'price_asc':
            return this.getRoomPrice(a) - this.getRoomPrice(b);
          case 'price_desc':
            return this.getRoomPrice(b) - this.getRoomPrice(a);
          case 'capacity_asc':
            return (
              (this.toNumber(a?.capacity) ?? 0) -
              (this.toNumber(b?.capacity) ?? 0)
            );
          case 'newest':
          default:
            return 0;
        }
      });

      const resultLimit = Math.max(1, Math.min(limit, 50));
      const result = sorted.slice(0, resultLimit);
      this.safeReportProgress(context, 100);

      return {
        success: true,
        data: {
          rooms: result,
          meta: {
            returned: result.length,
            total_matched: filtered.length,
            has_more: filtered.length > resultLimit,
          },
        },
      };
    } catch (error: any) {
      const msg = this.extractErrorMessage(error);
      this.logger.error(`search_rooms failed: ${msg}`, error.stack);
      return { success: false, error: `Không thể tìm kiếm phòng: ${msg}` };
    }
  }

  @Tool({
    name: 'search_buildings',
    description:
      'Tìm kiếm tòa nhà KTX theo text hoặc proximity search (place_name hoặc lat/lng).',
    parameters: z.object({
      keyword: z.string().optional(),
      city: z.string().optional(),
      district: z.string().optional(),
      ward: z.string().optional(),
      place_name: z.string().optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      radius_km: z.number().positive().max(50).optional().default(3),
      limit: z.number().int().min(1).max(50).optional().default(20),
    }),
  })
  async searchBuildings(
    {
      keyword,
      city,
      district,
      ward,
      place_name,
      latitude,
      longitude,
      radius_km = 3,
      limit = 20,
    }: {
      keyword?: string;
      city?: string;
      district?: string;
      ward?: string;
      place_name?: string;
      latitude?: number;
      longitude?: number;
      radius_km?: number;
      limit?: number;
    },
    context: Context,
  ) {
    try {
      const resultLimit = Math.max(1, Math.min(limit, 50));
      let resolvedLat = latitude;
      let resolvedLng = longitude;
      let resolvedAddress: string | undefined;

      if (place_name && resolvedLat === undefined) {
        this.safeReportProgress(context, 20);
        const geocode = await this.geocodePlaceWithGoogle(place_name);
        resolvedLat = geocode.lat;
        resolvedLng = geocode.lng;
        resolvedAddress = geocode.formattedAddress;
      }

      const isProximitySearch =
        resolvedLat !== undefined && resolvedLng !== undefined;
      const rows = this.shouldUseDirectDb()
        ? await this.readDbService.searchBuildings({
            keyword,
            city,
            district,
            ward,
            limit: isProximitySearch ? 500 : resultLimit,
          })
        : this.unwrapList(
            await this.getFromGateway('/buildings', {
              search: keyword,
              city,
              district,
              ward,
              limit: isProximitySearch ? 500 : resultLimit,
            }),
          );

      this.safeReportProgress(context, 70);
      const result = isProximitySearch
        ? rows
            .map((building) => {
              const { lat, lng } = this.parseBuildingCoordinates(building);
              if (lat === undefined || lng === undefined) return null;
              const distanceKm = this.haversineKm(
                resolvedLat!,
                resolvedLng!,
                lat,
                lng,
              );
              return {
                ...building,
                distance_km: Math.round(distanceKm * 100) / 100,
              };
            })
            .filter(
              (item): item is NonNullable<typeof item> =>
                item !== null && item.distance_km <= radius_km,
            )
            .sort((a, b) => a.distance_km - b.distance_km)
            .slice(0, resultLimit)
        : rows.slice(0, resultLimit);

      this.safeReportProgress(context, 100);
      return {
        success: true,
        data: {
          buildings: result,
          meta: {
            returned: result.length,
            search_strategy: isProximitySearch ? 'proximity' : 'text',
            reference_point: isProximitySearch
              ? {
                  place_name: place_name ?? null,
                  resolved_address: resolvedAddress ?? null,
                  latitude: resolvedLat,
                  longitude: resolvedLng,
                  radius_km,
                }
              : null,
          },
        },
      };
    } catch (error: any) {
      const msg = this.extractErrorMessage(error);
      this.logger.error(`search_buildings failed: ${msg}`, error.stack);
      return { success: false, error: `Không thể tìm kiếm tòa nhà: ${msg}` };
    }
  }

  @Tool({
    name: 'get_room_details',
    description: 'Lấy thông tin chi tiết của một phòng KTX bằng room_id.',
    parameters: z.object({
      room_id: z.string(),
    }),
  })
  async getRoomDetails({ room_id }: { room_id: string }, context: Context) {
    try {
      if (this.shouldUseDirectDb()) {
        const room = await this.readDbService.getRoomById(room_id);
        if (room) return { success: true, data: room };
      }
      const response = await firstValueFrom(
        this.httpService.get(`${this.gatewayUrl}/rooms/${room_id}`, {
          timeout: this.gatewayTimeoutMs,
        }),
      );
      return { success: true, data: response.data };
    } catch (error: any) {
      const msg = this.extractErrorMessage(error);
      this.logger.error(`get_room_details failed: ${msg}`, error.stack);
      return { success: false, error: `Không thể lấy thông tin phòng: ${msg}` };
    }
  }

  @Tool({
    name: 'get_building_details',
    description: 'Lấy thông tin chi tiết của một tòa nhà KTX bằng building_id.',
    parameters: z.object({
      building_id: z.string(),
    }),
  })
  async getBuildingDetails(
    { building_id }: { building_id: string },
    context: Context,
  ) {
    try {
      if (this.shouldUseDirectDb()) {
        const building = await this.readDbService.getBuildingById(building_id);
        if (building) return { success: true, data: building };
      }
      const response = await firstValueFrom(
        this.httpService.get(`${this.gatewayUrl}/buildings/${building_id}`, {
          timeout: this.gatewayTimeoutMs,
        }),
      );
      return { success: true, data: response.data };
    } catch (error: any) {
      const msg = this.extractErrorMessage(error);
      this.logger.error(`get_building_details failed: ${msg}`, error.stack);
      return {
        success: false,
        error: `Không thể lấy thông tin tòa nhà: ${msg}`,
      };
    }
  }

  @Tool({
    name: 'get_dormitory_overview',
    description:
      'Lấy thống kê tổng quan KTX: tổng tòa, tổng phòng, tỷ lệ lấp đầy, dải giá và tiện nghi phổ biến.',
    parameters: z.object({
      building_id: z.string().optional(),
    }),
  })
  async getDormitoryOverview(
    { building_id }: { building_id?: string },
    context: Context,
  ) {
    try {
      this.safeReportProgress(context, 20);
      const [rooms, buildings] = await Promise.all([
        this.fetchAllRooms(),
        this.fetchAllBuildings(),
      ]);

      const scopedRooms = building_id
        ? rooms.filter((r) => r?.buildingId === building_id)
        : rooms;
      const prices = scopedRooms
        .map((r) => this.getRoomPrice(r))
        .filter((p) => p > 0);

      const amenityCount: Record<string, number> = {};
      for (const room of scopedRooms) {
        for (const amenity of this.getRoomAmenities(room)) {
          amenityCount[amenity] = (amenityCount[amenity] ?? 0) + 1;
        }
      }
      const topAmenities = Object.entries(amenityCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, room_count]) => ({ name, room_count }));

      const availableCount = scopedRooms.filter((room) => {
        const status = String(room?.status ?? '').toUpperCase();
        return !status || status === 'AVAILABLE';
      }).length;

      const occupancyRatePercent =
        scopedRooms.length > 0
          ? Math.round((1 - availableCount / scopedRooms.length) * 100)
          : 0;

      this.safeReportProgress(context, 100);
      return {
        success: true,
        data: {
          scope: building_id ? `building:${building_id}` : 'system',
          buildings: {
            total: building_id
              ? buildings.filter((b) => b?.id === building_id).length
              : buildings.length,
          },
          rooms: {
            total: scopedRooms.length,
            available: availableCount,
            occupied: scopedRooms.length - availableCount,
            occupancy_rate: `${occupancyRatePercent}%`,
            occupancy_rate_percent: occupancyRatePercent,
          },
          pricing:
            prices.length > 0
              ? {
                  min: Math.min(...prices),
                  max: Math.max(...prices),
                  avg: Math.round(
                    prices.reduce((s, p) => s + p, 0) / prices.length,
                  ),
                  currency: 'VND',
                }
              : null,
          top_amenities: topAmenities,
        },
      };
    } catch (error: any) {
      const msg = this.extractErrorMessage(error);
      this.logger.error(`get_dormitory_overview failed: ${msg}`, error.stack);
      return { success: false, error: `Không thể lấy tổng quan KTX: ${msg}` };
    }
  }

  // Backward-compatible aliases
  @Tool({
    name: 'search_affordable_rooms',
    description: 'Alias cũ của search_rooms cho luồng tương thích.',
    parameters: z.object({
      max_price: z.number(),
      min_capacity: z.number().optional(),
      building_id: z.string().optional(),
      limit: z.number().optional(),
    }),
  })
  async searchAffordableRoomsAlias(
    args: {
      max_price: number;
      min_capacity?: number;
      building_id?: string;
      limit?: number;
    },
    context: Context,
  ) {
    return this.searchRooms(
      {
        max_price: args.max_price,
        min_capacity: args.min_capacity,
        building_id: args.building_id,
        limit: args.limit,
        available_only: true,
        sort_by: 'price_asc',
      },
      context,
    );
  }

  @Tool({
    name: 'search_rooms_with_amenities',
    description: 'Alias cũ của search_rooms với required_amenities.',
    parameters: z.object({
      required_amenities: z.array(z.string()).min(1),
      max_price: z.number().optional(),
      building_id: z.string().optional(),
      min_capacity: z.number().optional(),
      limit: z.number().optional(),
    }),
  })
  async searchRoomsWithAmenitiesAlias(
    args: {
      required_amenities: string[];
      max_price?: number;
      building_id?: string;
      min_capacity?: number;
      limit?: number;
    },
    context: Context,
  ) {
    return this.searchRooms(
      {
        required_amenities: args.required_amenities,
        max_price: args.max_price,
        min_capacity: args.min_capacity,
        building_id: args.building_id,
        limit: args.limit,
      },
      context,
    );
  }

  @Tool({
    name: 'search_dormitory_buildings_by_location',
    description: 'Alias cũ của search_buildings cho tìm theo khu vực text.',
    parameters: z.object({
      keyword: z.string().optional(),
      city: z.string().optional(),
      district: z.string().optional(),
      ward: z.string().optional(),
      limit: z.number().optional(),
    }),
  })
  async searchDormitoryBuildingsByLocationAlias(
    args: {
      keyword?: string;
      city?: string;
      district?: string;
      ward?: string;
      limit?: number;
    },
    context: Context,
  ) {
    return this.searchBuildings(args, context);
  }

  @Tool({
    name: 'find_nearby_dormitory_buildings',
    description: 'Alias cũ của search_buildings theo lat/lng.',
    parameters: z.object({
      latitude: z.number(),
      longitude: z.number(),
      radius_km: z.number().optional(),
      limit: z.number().optional(),
    }),
  })
  async findNearbyDormitoryBuildingsAlias(
    args: {
      latitude: number;
      longitude: number;
      radius_km?: number;
      limit?: number;
    },
    context: Context,
  ) {
    return this.searchBuildings(
      {
        latitude: args.latitude,
        longitude: args.longitude,
        radius_km: args.radius_km,
        limit: args.limit,
      },
      context,
    );
  }

  @Tool({
    name: 'find_nearby_dormitories_by_place',
    description: 'Alias cũ của search_buildings theo place name.',
    parameters: z.object({
      place_query: z.string().optional(),
      place_name: z.string().optional(),
      radius_km: z.number().optional(),
      include_rooms: z.boolean().optional(),
      limit: z.number().optional(),
    }),
  })
  async findNearbyDormitoriesByPlaceAlias(
    args: {
      place_query?: string;
      place_name?: string;
      radius_km?: number;
      include_rooms?: boolean;
      limit?: number;
    },
    context: Context,
  ) {
    const place = (args.place_query || args.place_name || '').trim();
    if (!place) {
      return {
        success: false,
        error: 'Thiếu tham số địa điểm: place_query hoặc place_name.',
      };
    }

    const result = await this.searchBuildings(
      {
        place_name: place,
        radius_km: args.radius_km,
        limit: args.limit,
      },
      context,
    );
    if (!result?.success) return result;

    const buildings = result?.data?.buildings || [];
    const shouldIncludeRooms = args.include_rooms !== false;
    let roomsByBuilding: Record<string, any[]> | undefined;

    if (shouldIncludeRooms && buildings.length > 0) {
      const allRooms = await this.fetchAllRooms();
      const buildingIds = new Set(buildings.map((b: any) => b.id));
      roomsByBuilding = {};
      for (const room of allRooms) {
        const bId = room?.buildingId;
        if (!bId || !buildingIds.has(bId)) continue;
        if (!roomsByBuilding[bId]) roomsByBuilding[bId] = [];
        roomsByBuilding[bId].push(room);
      }
    }

    return {
      success: true,
      data: {
        query: {
          placeQuery: place,
          radiusKm: args.radius_km ?? 3,
        },
        buildings,
        roomsByBuilding: shouldIncludeRooms ? roomsByBuilding || {} : undefined,
        meta: {
          totalBuildings: buildings.length,
          includeRooms: shouldIncludeRooms,
        },
      },
    };
  }
}
