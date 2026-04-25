import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

interface SearchBuildingsParams {
  keyword?: string;
  city?: string;
  district?: string;
  ward?: string;
  limit?: number;
  latitude?: number;
  longtitude?: number;
}

interface SearchRoomsParams {
  minPrice?: number;
  maxPrice?: number;
  minCapacity?: number;
  maxCapacity?: number;
  roomType?: string;
  buildingId?: string;
  availableOnly?: boolean;
  requiredAmenities?: string[];
  limit?: number;
}

@Injectable()
export class ReadDbService implements OnModuleDestroy {
  private readonly logger = new Logger(ReadDbService.name);
  private readonly roomPool: Pool;
  private readonly buildingPool: Pool;
  private readonly bookingPool: Pool;

  constructor(private readonly configService: ConfigService) {
    const roomDbUrl = this.configService.get<string>('ROOM_DATABASE_URL');
    const buildingDbUrl = this.configService.get<string>('BUILDING_DATABASE_URL');
    const bookingDbUrl = this.configService.get<string>('BOOKING_DATABASE_URL');

    if (!roomDbUrl || !buildingDbUrl || !bookingDbUrl) {
      this.logger.warn(
        'Database URLs are not fully configured. MCP will fallback to gateway path where possible.',
      );
    }

    this.roomPool = new Pool({
      connectionString: roomDbUrl,
      max: 10,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 3000,
    });

    this.buildingPool = new Pool({
      connectionString: buildingDbUrl,
      max: 10,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 3000,
    });

    this.bookingPool = new Pool({
      connectionString: bookingDbUrl,
      max: 10,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 3000,
    });
  }

  isReady(): boolean {
    return !!(
      this.configService.get<string>('ROOM_DATABASE_URL') &&
      this.configService.get<string>('BUILDING_DATABASE_URL') &&
      this.configService.get<string>('BOOKING_DATABASE_URL')
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.roomPool.end(), this.buildingPool.end(), this.bookingPool.end()]);
  }

  async checkConnections(): Promise<{
    roomDb: { ok: boolean; error?: string };
    buildingDb: { ok: boolean; error?: string };
    bookingDb: { ok: boolean; error?: string };
  }> {
    const [roomResult, buildingResult, bookingResult] = await Promise.allSettled([
      this.roomPool.query('SELECT 1'),
      this.buildingPool.query('SELECT 1'),
      this.bookingPool.query('SELECT 1'),
    ]);

    return {
      roomDb:
        roomResult.status === 'fulfilled'
          ? { ok: true }
          : { ok: false, error: roomResult.reason?.message || 'room DB check failed' },
      buildingDb:
        buildingResult.status === 'fulfilled'
          ? { ok: true }
          : { ok: false, error: buildingResult.reason?.message || 'building DB check failed' },
      bookingDb:
        bookingResult.status === 'fulfilled'
          ? { ok: true }
          : { ok: false, error: bookingResult.reason?.message || 'booking DB check failed' },
    };
  }

  async searchBuildings(params: SearchBuildingsParams): Promise<any[]> {
    const { keyword, city, district, ward } = params;
    const limit = Math.max(1, Math.min(params.limit ?? 20, 500));
    const values: any[] = [];
    const where: string[] = [];

    if (keyword) {
      values.push(`%${keyword}%`);
      where.push(`("name" ILIKE $${values.length} OR "address" ILIKE $${values.length})`);
    }
    if (city) {
      values.push(`%${city}%`);
      where.push(`("city" ILIKE $${values.length} OR "address" ILIKE $${values.length})`);
    }
    if (district) {
      values.push(`%${district}%`);
      where.push(`"address" ILIKE $${values.length}`);
    }
    if (ward) {
      values.push(`%${ward}%`);
      where.push(`"address" ILIKE $${values.length}`);
    }

    values.push(limit);
    const sql = `
      SELECT
        "id", "name", "address", "images", "city", "country", "description",
        "latitude", "longtitude", "roomsCount", "createdAt", "updatedAt"
      FROM "building"
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY "createdAt" DESC
      LIMIT $${values.length}
    `;
    const result = await this.buildingPool.query(sql, values);
    return result.rows;
  }

  async searchRooms(params: SearchRoomsParams): Promise<any[]> {
    const {
      minPrice,
      maxPrice,
      minCapacity,
      maxCapacity,
        roomType,
      buildingId,
      availableOnly,
      requiredAmenities,
    } = params;
    const limit = Math.max(1, Math.min(params.limit ?? 300, 500));
    const values: any[] = [];
    const where: string[] = [];

    if (minPrice !== undefined) {
      values.push(minPrice);
      where.push(`"price" >= $${values.length}`);
    }
    if (maxPrice !== undefined) {
      values.push(maxPrice);
      where.push(`"price" <= $${values.length}`);
    }
    if (minCapacity !== undefined) {
      values.push(minCapacity);
      where.push(`"capacity" >= $${values.length}`);
    }
    if (maxCapacity !== undefined) {
      values.push(maxCapacity);
      where.push(`"capacity" <= $${values.length}`);
    }
    if (roomType) {
      values.push(`%${roomType}%`);
      where.push(`("name" ILIKE $${values.length} OR "description" ILIKE $${values.length})`);
    }
    if (buildingId) {
      values.push(buildingId);
      where.push(`"building_id" = $${values.length}`);
    }
    if (availableOnly === true) {
      where.push(`UPPER("status") = 'AVAILABLE'`);
    }
    if (requiredAmenities && requiredAmenities.length > 0) {
      const normalizedAmenities = requiredAmenities
        .map((a) => a?.trim())
        .filter(Boolean);
      if (normalizedAmenities.length > 0) {
        values.push(normalizedAmenities);
        where.push(`
          "id" IN (
            SELECT ra."roomId"
            FROM "room_amenities" ra
            WHERE ra."name" = ANY($${values.length}::text[])
            GROUP BY ra."roomId"
            HAVING COUNT(DISTINCT ra."name") = ${normalizedAmenities.length}
          )
        `);
      }
    }

    values.push(limit);
    const sql = `
      SELECT
        "id",
        "building_id" AS "buildingId",
        "name",
        "description",
        "price",
        "capacity",
        "squareMeter",
        "bedCount",
        "bathroomCount",
        "floor",
        "countCapacity",
        "status",
        "createdAt",
        "updatedAt"
      FROM "rooms"
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY "createdAt" DESC
      LIMIT $${values.length}
    `;

    const roomsResult = await this.roomPool.query(sql, values);
    const rooms = roomsResult.rows;
    if (rooms.length === 0) return [];

    const roomIds = rooms.map((r) => r.id);
    const buildingIds = Array.from(new Set(rooms.map((r) => r.buildingId).filter(Boolean)));

    const [amenitiesResult, imagesResult, buildingsResult] = await Promise.all([
      this.roomPool.query(
        `
        SELECT "id", "roomId", "name", "createdAt", "updatedAt"
        FROM "room_amenities"
        WHERE "roomId" = ANY($1::text[])
      `,
        [roomIds],
      ),
      this.roomPool.query(
        `
        SELECT "id", "room_id" AS "roomId", "image_url" AS "imageUrl", "image_public_id" AS "imagePublicId", "createdAt", "updatedAt"
        FROM "room_images"
        WHERE "room_id" = ANY($1::text[])
      `,
        [roomIds],
      ),
      this.buildingPool.query(
        `
        SELECT "id", "name", "address", "city", "country", "description", "latitude", "longtitude", "images", "roomsCount", "createdAt", "updatedAt"
        FROM "building"
        WHERE "id" = ANY($1::text[])
      `,
        [buildingIds],
      ),
    ]);

    const amenitiesByRoomId = new Map<string, any[]>();
    for (const amenity of amenitiesResult.rows) {
      if (!amenitiesByRoomId.has(amenity.roomId)) amenitiesByRoomId.set(amenity.roomId, []);
      amenitiesByRoomId.get(amenity.roomId)!.push(amenity);
    }

    const imagesByRoomId = new Map<string, any[]>();
    for (const image of imagesResult.rows) {
      if (!imagesByRoomId.has(image.roomId)) imagesByRoomId.set(image.roomId, []);
      imagesByRoomId.get(image.roomId)!.push(image);
    }

    const buildingById = new Map<string, any>();
    for (const building of buildingsResult.rows) {
      buildingById.set(building.id, building);
    }

    return rooms.map((room) => ({
      ...room,
      amenities: amenitiesByRoomId.get(room.id) ?? [],
      images: imagesByRoomId.get(room.id) ?? [],
      building: buildingById.get(room.buildingId) ?? null,
    }));
  }

  async getRoomById(roomId: string): Promise<any | null> {
    const roomResult = await this.roomPool.query(
      `
      SELECT
        "id",
        "building_id" AS "buildingId",
        "name",
        "description",
        "price",
        "capacity",
        "squareMeter",
        "bedCount",
        "bathroomCount",
        "floor",
        "countCapacity",
        "status",
        "createdAt",
        "updatedAt"
      FROM "rooms"
      WHERE "id" = $1
      LIMIT 1
    `,
      [roomId],
    );
    const room = roomResult.rows[0];
    if (!room) return null;

    const [amenitiesResult, imagesResult, buildingResult] = await Promise.all([
      this.roomPool.query(
        `
        SELECT "id", "roomId", "name", "createdAt", "updatedAt"
        FROM "room_amenities"
        WHERE "roomId" = $1
      `,
        [roomId],
      ),
      this.roomPool.query(
        `
        SELECT "id", "room_id" AS "roomId", "image_url" AS "imageUrl", "image_public_id" AS "imagePublicId", "createdAt", "updatedAt"
        FROM "room_images"
        WHERE "room_id" = $1
      `,
        [roomId],
      ),
      this.buildingPool.query(
        `
        SELECT "id", "name", "address", "city", "country", "description", "latitude", "longtitude", "images", "roomsCount", "createdAt", "updatedAt"
        FROM "building"
        WHERE "id" = $1
        LIMIT 1
      `,
        [room.buildingId],
      ),
    ]);

    return {
      ...room,
      amenities: amenitiesResult.rows,
      images: imagesResult.rows,
      building: buildingResult.rows[0] ?? null,
    };
  }

  async getBuildingById(buildingId: string): Promise<any | null> {
    const result = await this.buildingPool.query(
      `
      SELECT
        "id", "name", "address", "images", "city", "country", "description",
        "latitude", "longtitude", "roomsCount", "createdAt", "updatedAt"
      FROM "building"
      WHERE "id" = $1
      LIMIT 1
    `,
      [buildingId],
    );
    return result.rows[0] ?? null;
  }

  async getRoomBookings(roomId: string, fromDate?: string | Date, toDate?: string | Date): Promise<any[]> {
    const values: any[] = [roomId];
    const where: string[] = [`bd."roomId" = $1`];
    where.push(`b."status" IN ('PENDING', 'CONFIRMED', 'ACTIVE')`); 
    
    if (fromDate) {
       values.push(new Date(fromDate));
       where.push(`b."endDate" >= $${values.length}`);
    }
    
    if (toDate) {
       values.push(new Date(toDate));
       where.push(`b."startDate" <= $${values.length}`);
    }

    const result = await this.bookingPool.query(
      `
      SELECT 
        b.id, b."userId", b.status, b."startDate", b."endDate", b."durationMonths", 
        b."isRelisted", b."renewalDeadline", b."paymentStatus", bd.price
      FROM "bookings" b
      JOIN "booking_details" bd ON b.id = bd."bookingId"
      WHERE ${where.join(' AND ')}
      ORDER BY b."startDate" ASC
      `
      , values
    );
    
    return result.rows;
  }
}

