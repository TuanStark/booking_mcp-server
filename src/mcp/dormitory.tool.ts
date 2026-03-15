import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, Tool } from '@rekog/mcp-nest';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';

@Injectable()
export class DormitoryTool {
    private readonly gatewayUrl: string;
    private readonly logger = new Logger(DormitoryTool.name);

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.gatewayUrl = this.configService.get<string>('GATEWAY_URL') || 'http://localhost:4000';
    }

    private extractErrorMessage(error: any): string {
        return error.response?.data?.message || error.message || 'Unknown gateway error occurred';
    }

    @Tool({
        name: 'search_rooms',
        description: 'Tìm kiếm phòng Ký túc xá (dormitory rooms) dựa trên các tiêu chí lọc như: khoảng giá, sức chứa (số người), và loại phòng. Sử dụng tool này khi sinh viên/khách hàng muốn tìm phòng, kiểm tra tình trạng phòng trống hoặc xem danh sách phòng thỏa mãn yêu cầu.',
        parameters: z.object({
            min_price: z.number().optional().describe('Giá cho thuê tối thiểu (VNĐ)'),
            max_price: z.number().optional().describe('Giá cho thuê tối đa (VNĐ)'),
            capacity: z.number().optional().describe('Sức chứa mong muốn của phòng (số người/giường)'),
            room_type: z.string().optional().describe('Loại phòng (ví dụ: standard, studio, dorm, single, double)'),
            building_id: z.string().optional().describe('ID của tòa nhà nếu khách hàng muốn giới hạn tìm kiếm trong 1 khu vực/tòa cụ thể')
        }),
    })
    async searchRooms(
        { min_price, max_price, capacity, room_type, building_id }: {
            min_price?: number;
            max_price?: number;
            capacity?: number;
            room_type?: string;
            building_id?: string;
        },
        context: Context,
    ) {
        try {
            this.logger.debug(`Searching rooms with params: ${JSON.stringify({ min_price, max_price, capacity, room_type, building_id })}`);

            context.reportProgress({
                progress: 50,
                total: 100,
            });

            const params = new URLSearchParams();
            if (min_price !== undefined) params.append('minPrice', min_price.toString());
            if (max_price !== undefined) params.append('maxPrice', max_price.toString());
            if (capacity !== undefined) params.append('capacity', capacity.toString());
            if (room_type) params.append('type', room_type);
            if (building_id) params.append('buildingId', building_id);

            const url = `${this.gatewayUrl}/rooms${params.toString() ? '?' + params.toString() : ''}`;
            const response = await firstValueFrom(this.httpService.get(url));

            this.logger.log(`Found ${response.data?.data?.length || 0} rooms matching criteria.`);

            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            const errorMsg = this.extractErrorMessage(error);
            this.logger.error(`Failed to search rooms: ${errorMsg}`, error.stack);
            return {
                success: false,
                error: `Không thể tìm kiếm phòng KTX: ${errorMsg}`,
            };
        }
    }

    @Tool({
        name: 'get_room_details',
        description: 'Lấy thông tin chi tiết của một phòng Ký túc xá cụ thể bằng ID. Cung cấp đầy đủ thông tin về tiện ích, hình ảnh, trạng thái và giá cả.',
        parameters: z.object({
            room_id: z.string().describe('ID định danh của phòng cần xem chi tiết'),
        }),
    })
    async getRoomDetails({ room_id }: { room_id: string }, context: Context) {
        try {
            this.logger.debug(`Fetching details for room ID: ${room_id}`);
            const response = await firstValueFrom(
                this.httpService.get(`${this.gatewayUrl}/rooms/${room_id}`)
            );
            return { success: true, data: response.data };
        } catch (error: any) {
            const errorMsg = this.extractErrorMessage(error);
            this.logger.error(`Failed to get details for room ${room_id}: ${errorMsg}`, error.stack);
            return { success: false, error: `Lỗi khi lấy thông tin phòng: ${errorMsg}` };
        }
    }

    @Tool({
        name: 'search_buildings',
        description: 'Tìm kiếm danh sách các tòa nhà Ký túc xá (Khu KTX/Cơ sở) dựa trên từ khóa tên. Sử dụng khi cần tìm thông tin tổng quan về một khu KTX.',
        parameters: z.object({
            keyword: z.string().optional().describe('Từ khóa tìm kiếm tên tòa nhà hoặc địa chỉ'),
        }),
    })
    async searchBuildings({ keyword }: { keyword?: string }, context: Context) {
        try {
            this.logger.debug(`Searching buildings with keyword: ${keyword || 'none'}`);
            const params = new URLSearchParams();
            if (keyword) params.append('search', keyword);

            const url = `${this.gatewayUrl}/buildings${params.toString() ? '?' + params.toString() : ''}`;
            const response = await firstValueFrom(this.httpService.get(url));

            this.logger.log(`Found ${response.data?.data?.length || 0} buildings matching criteria.`);
            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            const errorMsg = this.extractErrorMessage(error);
            this.logger.error(`Failed to search buildings: ${errorMsg}`, error.stack);
            return {
                success: false,
                error: `Không thể tìm kiếm tòa nhà: ${errorMsg}`,
            };
        }
    }

    @Tool({
        name: 'get_building_details',
        description: 'Lấy thông tin chi tiết của một khối nhà/tòa nhà Ký túc xá cụ thể bằng ID, bao gồm địa chỉ, quản lý, và mô tả chung.',
        parameters: z.object({
            building_id: z.string().describe('ID định danh của tòa nhà'),
        }),
    })
    async getBuildingDetails({ building_id }: { building_id: string }, context: Context) {
        try {
            this.logger.debug(`Fetching details for building ID: ${building_id}`);
            const response = await firstValueFrom(
                this.httpService.get(`${this.gatewayUrl}/buildings/${building_id}`)
            );
            return { success: true, data: response.data };
        } catch (error: any) {
            const errorMsg = this.extractErrorMessage(error);
            this.logger.error(`Failed to get details for building ${building_id}: ${errorMsg}`, error.stack);
            return { success: false, error: `Lỗi khi lấy chi tiết tòa nhà: ${errorMsg}` };
        }
    }
}
