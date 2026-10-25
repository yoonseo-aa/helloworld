package com.helloworld.domain.post.controller;

import com.helloworld.domain.post.dto.request.PostCreateRequest;
import com.helloworld.domain.post.dto.response.FeedListResponse;
import com.helloworld.domain.post.dto.response.PostCreateResponse;
import com.helloworld.domain.post.dto.response.PostDetailResponse;
import com.helloworld.domain.post.service.PostService;
import com.helloworld.global.common.ApiResponse;
import com.helloworld.global.security.LoginUserId;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * 게시물 API (프레젠테이션 계층).
 *
 * [학습 포인트] 계층형 아키텍처에서 Controller의 책임
 *  - "HTTP를 Java 호출로 번역"하는 얇은 계층. 비즈니스 로직을 두지 않는다.
 *  - 호출 방향은 항상 Controller → Service → Mapper. (Controller가 Mapper 직접 호출 금지)
 *  - 왜? 로직이 Service에 모여야 재사용/트랜잭션/테스트가 쉬워지고,
 *        컨트롤러는 요청 파싱·검증·응답 포맷팅만 담당해 얇게 유지된다.
 *
 * [학습 포인트] 클래스 레벨 애노테이션
 *  - @RestController        : @Controller + @ResponseBody. 반환값이 그대로 응답 바디(JSON)가 된다.
 *  - @RequestMapping        : 이 컨트롤러의 공통 URL 접두어. 규약상 /api/ + 복수형 리소스(posts) + 동사 금지.
 *  - @RequiredArgsConstructor : final 필드(postService)를 인자로 받는 생성자를 Lombok이 생성 → 생성자 주입.
 */
@RestController
@RequestMapping("/api/posts")   // 리소스 복수형, /api/ 접두어(버전 없음)
@RequiredArgsConstructor
public class PostController {

    // 생성자 주입(final). 필드 주입(@Autowired)보다 권장: 불변성 보장 + 테스트 시 주입 쉬움
    private final PostService postService;

    /**
     * 게시물 생성. (POST /api/posts)
     *
     * [학습 포인트] 파라미터 3형태
     *  - @LoginUserId Long userId : "행위 주체(작성자)". 요청 바디가 아니라 인증 토큰에서 온다.
     *      → 클라이언트가 user_id를 조작할 수 없게 하기 위함(보안). 커스텀 ArgumentResolver가 주입.
     *  - @Valid                   : RequestBody의 Bean Validation(@NotBlank 등)을 트리거. 실패 시
     *      MethodArgumentNotValidException → GlobalExceptionHandler가 400으로 변환(우리가 try-catch 안 함).
     *  - @RequestBody             : JSON 본문을 DTO로 역직렬화. snake_case→camelCase는 Jackson 전역설정이 처리.
     *
     * [학습 포인트] 반환
     *  - 규약상 모든 응답은 ApiResponse<T>로 감싼다(성공/에러 포맷 통일).
     *  - "생성"은 관례상 HTTP 201 Created를 쓴다(200 OK 아님).
     */
    @PostMapping
    public ResponseEntity<ApiResponse<PostCreateResponse>> createPost(
            @LoginUserId Long userId,
            @Valid @RequestBody PostCreateRequest request) {
        PostCreateResponse data = postService.createPost(userId, request);
        return ResponseEntity
                .status(HttpStatus.CREATED)   // 201: 리소스 생성 성공
                .body(ApiResponse.success("게시물이 등록되었습니다.", data));
    }

    /**
     * 메인 피드 조회 (GET /api/posts?cursor={token}&post_type={PROJECT|CARD_NEWS}&size=10)
     *
     * 전체 공개 게시물을 내려주되, 팔로우한 유저의 최근 30분 글을 상단에 고정한다(본인 글 제외).
     * post_type을 주면 해당 유형만(프론트 탭: 전체/프로젝트/카드뉴스), 없으면 전체를 내려준다.
     *
     * [학습 포인트] 커서가 불투명 문자열 토큰인 이유
     *  - 상단 고정 정렬은 (is_pinned, created_at, post_id) 3-키라 숫자 하나로 다음 위치를 표현 못 한다.
     *  - 서버가 3-키를 base64로 포장해 next_cursor(문자열)로 내려주고, 프론트는 해석 없이 그대로 echo한다.
     *  - cursor = 직전 페이지 마지막 항목의 토큰. 첫 페이지는 생략(null).
     */
    @GetMapping
    public ResponseEntity<ApiResponse<FeedListResponse>> getFeed(
            @LoginUserId Long userId,
            @RequestParam(required = false) String cursor,
            @RequestParam(value = "post_type", required = false) String postType,
            @RequestParam(defaultValue = "10") int size) {
        // size 보정·post_type 검증은 서비스가 일괄 처리한다(컨트롤러 중복 제거)
        FeedListResponse data = postService.getFeed(userId, cursor, postType, size);
        return ResponseEntity.ok(ApiResponse.success(data));
    }

    /**
     * 게시물 상세 조회 (GET /api/posts/{postId})
     *
     * 작성자·기술스택·이미지·좋아요·팔로우여부를 함께 반환하고, 조회 시 조회수를 1 증가시킨다.
     * 비공개 글은 작성자 본인만 열람 가능(아니면 403 POST_FORBIDDEN).
     */
    @GetMapping("/{postId}")
    public ResponseEntity<ApiResponse<PostDetailResponse>> getPostDetail(
            @LoginUserId Long userId,
            @PathVariable Long postId) {
        PostDetailResponse data = postService.getPostDetail(userId, postId);
        return ResponseEntity.ok(ApiResponse.success(data));
    }
}
