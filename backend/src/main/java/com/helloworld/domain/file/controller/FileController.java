package com.helloworld.domain.file.controller;

import com.helloworld.domain.file.dto.response.FileUploadResponse;
import com.helloworld.domain.file.service.FileService;
import com.helloworld.global.common.ApiResponse;
import com.helloworld.global.security.LoginUserId;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 파일 업로드 API.
 *
 * <p>프론트가 이미 구현해 둔 계약에 맞춘다({@code frontend/src/api/files.ts}):
 * {@code POST /api/files}, multipart 필드명 {@code file}, 응답 {@code data.file_url}.
 *
 * <p>업로드만 백엔드를 거치고 <b>조회는 거치지 않는다.</b> 이미지는 nginx가 MinIO로 직접
 * 프록시하므로(공개 읽기 버킷) 피드에서 이미지 수십 개를 받아도 앱에 부하가 없다.
 * 그래서 이 컨트롤러에 다운로드 엔드포인트가 없다.
 */
@Tag(name = "파일", description = "파일 업로드 API")
@RestController
@RequestMapping("/api/files")
@RequiredArgsConstructor
public class FileController {

    private final FileService fileService;

    /**
     * 이미지 1개 업로드.
     *
     * <p>로그인을 요구하는 이유: 인증 없이 열어두면 아무나 우리 스토리지를 무료 이미지 호스팅으로
     * 쓸 수 있다. userId를 실제로 쓰지는 않지만(파일에 소유자를 기록하지 않는다) 인증은 필요하다.
     */
    @Operation(summary = "파일 업로드", description = "이미지 1개를 업로드하고 접근 URL을 반환합니다. (jpg/png/webp/gif, 최대 5MB)")
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<FileUploadResponse>> upload(
            @LoginUserId Long userId,
            @RequestParam("file") MultipartFile file) {
        FileUploadResponse data = fileService.upload(file);
        return ResponseEntity.ok(ApiResponse.success("파일을 업로드했습니다.", data));
    }
}
