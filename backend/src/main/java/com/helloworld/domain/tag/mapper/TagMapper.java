package com.helloworld.domain.tag.mapper;

import com.helloworld.domain.tag.entity.Tag;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 태그 조회 (MyBatis). SQL은 resources/mapper/tag/TagMapper.xml 에 작성.
 */
@Mapper
public interface TagMapper {

    /** 태그 목록 조회. tagType이 있으면 해당 유형만, 없으면 전체. */
    List<Tag> selectTags(@Param("tagType") String tagType);
}
