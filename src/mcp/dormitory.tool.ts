import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, Tool } from '@rekog/mcp-nest';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';

@Injectable()
export class DormitoryTool {
    private readonly gatewayUrl: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.gatewayUrl = this.configService.get<string>('GATEWAY_URL') || 'http://localhost:4000';
    }

    @Tool({
        name: 'search_rooms',
        description: 'Tìm kiếm phòng Ký túc xá dựa trên các tiêu chí (giá, sức chứa, kiểu phòng). Luôn sử dụng tool này khi khách hàng muốn tìm phòng hoặc hỏi có phòng nào trống không.',
        parameters: z.object({
            min_price: z.number().optional().describe('Giá tối thiểu'),
            max_price: z.number().optional().describe('Giá tối đa'),
            capacity: z.number().optional().describe('Sức chứa của phòng (số người)'),
            room_type: z.string().optional().describe('Loại phòng (ví dụ: standard, studio)'),
            building_id: z.string().optional().describe('ID của tòa nhà nếu muốn giới hạn trong 1 tòa')
        }),
    })
    async searchRooms(
        { min_price, max_price, capacity, room_type, building_id },
        context: Context,
    ) {
        try {
            context.reportProgress({
                progress: 50,
                total: 100,
            });

            const params = new URLSearchParams();
            if (min_price) params.append('minPrice', min_price.toString());
            if (max_price) params.append('maxPrice', max_price.toString());
            if (capacity) params.append('capacity', capacity.toString());
            if (room_type) params.append('type', room_type);
            if (building_id) params.append('buildingId', building_id);

            const response = await firstValueFrom(
                this.httpService.get(`${this.gatewayUrl}/rooms?${params.toString()}`)
            );

            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message,
            };
        }
    }

    @Tool({
        name: 'get_room_details',
        description: 'Lấy thông tin chi tiết của một phòng cụ thể bằng ID.',
        parameters: z.object({
            room_id: z.string().describe('ID của phòng cần xem chi tiết'),
        }),
    })
    async getRoomDetails({ room_id }, context: Context) {
        try {
            const response = await firstValueFrom(
                this.httpService.get(`${this.gatewayUrl}/rooms/${room_id}`)
            );
            return { success: true, data: response.data };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    @Tool({
        name: 'search_buildings',
        description: 'Tìm kiếm các tòa nhà Ký túc xá.',
        parameters: z.object({
            keyword: z.string().optional().describe('Từ khóa tìm kiếm tên tòa nhà'),
        }),
    })
    async searchBuildings({ keyword }, context: Context) {
        try {
            const params = new URLSearchParams();
            if (keyword) params.append('search', keyword);

            const response = await firstValueFrom(
                this.httpService.get(`${this.gatewayUrl}/buildings?${params.toString()}`)
            );

            return {
                success: true,
                data: response.data,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message,
            };
        }
    }

    @Tool({
        name: 'get_building_details',
        description: 'Lấy thông tin chi tiết của một tòa nhà bằng ID.',
        parameters: z.object({
            building_id: z.string().describe('ID của tòa nhà'),
        }),
    })
    async getBuildingDetails({ building_id }, context: Context) {
        try {
            const response = await firstValueFrom(
                this.httpService.get(`${this.gatewayUrl}/buildings/${building_id}`)
            );
            return { success: true, data: response.data };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
}
